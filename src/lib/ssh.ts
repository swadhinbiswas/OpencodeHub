/**
 * SSH Git Server
 * Handles SSH connections for git push/pull operations
 */

import { spawn } from "child_process";
import { generateKeyPairSync } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { Server } from "ssh2";

export interface SSHServerConfig {
  port: number;
  hostKeyPath: string;
  reposPath: string;
  authenticateUser: (
    username: string,
    key: Buffer
  ) => Promise<{
    valid: boolean;
    userId?: string;
    canRead?: boolean;
    canWrite?: boolean;
  }>;
  authorizeRepo: (
    userId: string,
    repoPath: string,
    operation: "read" | "write"
  ) => Promise<boolean>;
  onPush?: (userId: string, repoPath: string, refs: string[]) => Promise<void>;
}

export function createSSHServer(config: SSHServerConfig): Server {
  const {
    port,
    hostKeyPath,
    reposPath,
    authenticateUser,
    authorizeRepo,
    onPush,
  } = config;

  // Generate or load host key
  const hostKey = loadOrGenerateHostKey(hostKeyPath);

  const server = new Server(
    {
      hostKeys: [hostKey],
    },
    (client) => {
      let userId: string | undefined;
      let username: string | undefined;
      let canWrite = false;

      client.on("authentication", async (ctx) => {
        if (ctx.method === "publickey") {
          try {
            const result = await authenticateUser(ctx.username, ctx.key.data);
            if (result.valid) {
              userId = result.userId;
              username = ctx.username;
              canWrite = result.canWrite ?? false;
              ctx.accept();
              return;
            }
          } catch (error) {
            console.error("Auth error:", error);
          }
        }
        ctx.reject(["publickey"]);
      });

      client.on("ready", () => {
        console.log(`SSH client connected: ${username}`);

        client.on("session", (accept, reject) => {
          const session = accept();

          session.on("exec", async (accept, reject, info) => {
            const command = info.command;
            console.log(`SSH exec: ${command}`);

            // Parse git command
            const gitCommand = parseGitCommand(command);
            if (!gitCommand) {
              reject();
              return;
            }

            const { operation, repoPath: requestedPath } = gitCommand;

            // Normalize and validate repo path
            const normalizedPath = normalizeRepoPath(requestedPath);
            const fullRepoPath = join(reposPath, normalizedPath);

            // Check authorization
            const isWrite = operation === "git-receive-pack";
            const authorized = userId
              ? await authorizeRepo(
                  userId,
                  normalizedPath,
                  isWrite ? "write" : "read"
                )
              : false;

            if (!authorized) {
              const channel = accept();
              channel.stderr.write("Permission denied\n");
              channel.exit(1);
              channel.close();
              return;
            }

            if (isWrite && !canWrite) {
              const channel = accept();
              channel.stderr.write("Write access denied\n");
              channel.exit(1);
              channel.close();
              return;
            }

            // Ensure repo exists
            if (!existsSync(fullRepoPath)) {
              const channel = accept();
              channel.stderr.write("Repository not found\n");
              channel.exit(1);
              channel.close();
              return;
            }

            // Execute git command
            const channel = accept();
            const gitProcess = spawn(operation, [fullRepoPath], {
              stdio: ["pipe", "pipe", "pipe"],
            });

            // Track refs for push hook
            let receivedRefs: string[] = [];

            channel.pipe(gitProcess.stdin);
            gitProcess.stdout.pipe(channel);
            gitProcess.stderr.pipe(channel.stderr);

            // Capture refs on push
            if (isWrite) {
              gitProcess.stdin.on("data", (data: Buffer) => {
                const lines = data.toString().split("\n");
                for (const line of lines) {
                  // Format: oldsha newsha refname
                  const match = line.match(
                    /^([a-f0-9]+)\s+([a-f0-9]+)\s+(.+)$/
                  );
                  if (match) {
                    receivedRefs.push(match[3]);
                  }
                }
              });
            }

            gitProcess.on("close", async (code) => {
              // Call push hook on successful push
              if (
                isWrite &&
                code === 0 &&
                userId &&
                receivedRefs.length > 0 &&
                onPush
              ) {
                try {
                  await onPush(userId, normalizedPath, receivedRefs);
                } catch (error) {
                  console.error("Push hook error:", error);
                }
              }

              channel.exit(code || 0);
              channel.close();
            });

            gitProcess.on("error", (error) => {
              console.error("Git process error:", error);
              channel.stderr.write(`Error: ${error.message}\n`);
              channel.exit(1);
              channel.close();
            });
          });

          session.on("shell", (accept, reject) => {
            // Don't allow shell access
            reject();
          });
        });
      });

      client.on("error", (error) => {
        console.error("SSH client error:", error);
      });

      client.on("end", () => {
        console.log(`SSH client disconnected: ${username}`);
      });
    }
  );

  return server;
}

/**
 * Parse a git SSH command
 */
function parseGitCommand(
  command: string
): { operation: string; repoPath: string } | null {
  // Format: git-upload-pack '/path/to/repo.git' or git-receive-pack '/path/to/repo.git'
  const match = command.match(
    /^(git-upload-pack|git-receive-pack)\s+'?([^']+)'?$/
  );
  if (!match) return null;

  return {
    operation: match[1],
    repoPath: match[2],
  };
}

/**
 * Normalize repository path (remove leading slash, ensure .git suffix)
 */
function normalizeRepoPath(path: string): string {
  let normalized = path.replace(/^\/+/, "");
  if (!normalized.endsWith(".git")) {
    normalized += ".git";
  }
  return normalized;
}

/**
 * Load or generate SSH host key
 */
function loadOrGenerateHostKey(keyPath: string): string {
  if (existsSync(keyPath)) {
    return readFileSync(keyPath, "utf8");
  }

  // Ensure directory exists
  const dir = dirname(keyPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Generate new key pair
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    privateKeyEncoding: {
      type: "pkcs1",
      format: "pem",
    },
    publicKeyEncoding: {
      type: "pkcs1",
      format: "pem",
    },
  });

  writeFileSync(keyPath, privateKey, { mode: 0o600 });
  console.log(`Generated new SSH host key at ${keyPath}`);

  return privateKey;
}

/**
 * Start the SSH server
 */
export async function startSSHServer(config: SSHServerConfig): Promise<void> {
  const server = createSSHServer(config);

  return new Promise((resolve, reject) => {
    server.listen(config.port, "0.0.0.0", () => {
      console.log(`SSH Git server listening on port ${config.port}`);
      resolve();
    });

    server.on("error", (error) => {
      console.error("SSH server error:", error);
      reject(error);
    });
  });
}

/**
 * Validate SSH public key format
 */
export function validateSSHPublicKey(key: string): boolean {
  const keyTypes = [
    "ssh-rsa",
    "ssh-ed25519",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
  ];
  const parts = key.trim().split(" ");

  if (parts.length < 2) return false;
  if (!keyTypes.includes(parts[0])) return false;

  // Check if base64 part is valid
  try {
    Buffer.from(parts[1], "base64");
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse SSH public key to get type and fingerprint
 */
export function parseSSHPublicKey(key: string): {
  type: string;
  fingerprint: string;
  comment?: string;
} | null {
  const parts = key.trim().split(" ");
  if (parts.length < 2) return null;

  const type = parts[0];
  const data = parts[1];
  const comment = parts.slice(2).join(" ") || undefined;

  // Generate fingerprint
  const crypto = require("crypto");
  const buffer = Buffer.from(data, "base64");
  const hash = crypto.createHash("sha256").update(buffer).digest("base64");
  const fingerprint = `SHA256:${hash.replace(/=+$/, "")}`;

  return { type, fingerprint, comment };
}
