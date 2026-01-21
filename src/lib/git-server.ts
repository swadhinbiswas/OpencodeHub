
import { spawn, ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import * as fs from "fs/promises";
import { join, dirname } from "path";
import { PassThrough, Readable, Transform, Writable } from "stream";
import { pipeline } from "stream/promises";
import { getStorage } from "./storage";
import { logger } from "./logger";

// Packet Line Utilities
export function pktLine(str: string): string {
    const len = Buffer.byteLength(str, "utf8") + 4;
    const hex = len.toString(16).padStart(4, "0");
    return `${hex}${str}`;
}

export function flushPkt(): string {
    return "0000";
}

// Git Service Types
type GitService = "git-upload-pack" | "git-receive-pack";

interface ServiceOptions {
    repoPath: string; // Absolute path to bare repo
    service: GitService;
}

/**
 * Handles the info/refs request (Step 1 of push/pull)
 */
export async function getAdvertisedRefs(options: ServiceOptions): Promise<Buffer> {
    const { repoPath, service } = options;
    const serviceHeader = `# service=${service}\n`;
    const header = pktLine(serviceHeader) + flushPkt();
    const args = ["--stateless-rpc", "--advertise-refs", repoPath];
    const cmd = service === "git-upload-pack" ? "upload-pack" : "receive-pack";

    return new Promise((resolve, reject) => {
        const child = spawn("git", [cmd, ...args]);
        const chunks: Buffer[] = [];
        chunks.push(Buffer.from(header, "utf8"));
        child.stdout.on("data", (chunk) => chunks.push(chunk));
        child.on("close", (code) => {
            if (code === 0) resolve(Buffer.concat(chunks));
            else reject(new Error(`Git ${cmd} exited with code ${code}`));
        });
        child.on("error", reject);
    });
}

/**
 * Handles git-upload-pack (Clone/Fetch)
 */
export async function handleUploadPack(
    repoPath: string,
    reqBody: Readable | ReadableStream
): Promise<Readable> {
    const nodeStream = isReadable(reqBody) ? reqBody : Readable.fromWeb(reqBody as any);
    const child = spawn("git", ["upload-pack", "--stateless-rpc", repoPath], {
        stdio: ["pipe", "pipe", "pipe"],
    });
    nodeStream.pipe(child.stdin);
    return child.stdout;
}

class PackStreamProcessor extends Writable {
    private initialized = false;
    private storagePass?: PassThrough;
    private indexPass?: PassThrough;
    private uploadPromise?: Promise<void>;
    private indexPack?: ChildProcess;
    private indexPackPromise?: Promise<void>;
    public packHash = "";

    private tempIdxPath: string;
    private storageTempKey: string;

    constructor(
        private repoPath: string,
        private dbRepoPath: string,
        private storage: any
    ) {
        super();
        const tempId = randomBytes(8).toString('hex');
        const tempPackName = `incoming-${tempId}.pack`;
        this.storageTempKey = `${dbRepoPath}/objects/pack/${tempPackName}`;
        this.tempIdxPath = join(process.cwd(), ".tmp", `incoming-${tempId}.idx`);
    }

    async cleanup() {
        // Logic moved to handleReceivePack to avoid premature deletion
    }

    getFinalPaths(hash: string) {
        return {
            packKey: `${this.dbRepoPath}/objects/pack/pack-${hash}.pack`,
            idxKey: `${this.dbRepoPath}/objects/pack/pack-${hash}.idx`,
            idxPath: this.tempIdxPath,
            tempKey: this.storageTempKey
        };
    }

    _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        if (!this.initialized) {
            this.initialized = true;
            this.init(chunk).then(() => callback()).catch(callback);
        } else {
            this.storagePass?.write(chunk);
            this.indexPass?.write(chunk);
            callback();
        }
    }

    private async init(firstChunk: any) {
        await fs.mkdir(join(process.cwd(), ".tmp"), { recursive: true });

        this.storagePass = new PassThrough();
        this.indexPass = new PassThrough();

        // Start Storage Upload
        this.uploadPromise = this.storage.writeStream(this.storageTempKey, this.storagePass);

        // Start Index Pack
        // Note: --keep might cause packfile to be written to repo objects/pack directly if cwd is repoPath
        this.indexPack = spawn("git", ["index-pack", "--stdin", "-v", "--fix-thin", "--keep", `--index-version=2`, `-o`, this.tempIdxPath], {
            cwd: this.repoPath,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.indexPackPromise = new Promise<void>((resolve, reject) => {
            let out = "";
            this.indexPack!.stdout!.on('data', (d: any) => out += d.toString());
            this.indexPack!.on('close', (code: number) => {
                const match = out.trim().match(/([0-9a-f]{40})/);
                if (code === 0 && match) {
                    this.packHash = match[1];
                    resolve();
                } else {
                    reject(new Error(`index-pack failed code=${code} out=${out}`));
                }
            });
            this.indexPack!.stderr!.on('data', (d: any) => logger.debug(`[index-pack] ${d}`));
            this.indexPack!.on('error', reject);
        });

        // Pipe PassThroughs
        this.storagePass.write(firstChunk);
        this.indexPass.pipe(this.indexPack!.stdin!);
        this.indexPass.write(firstChunk);
    }

    _final(callback: (error?: Error | null) => void): void {
        if (this.initialized) {
            this.storagePass?.end();
            this.indexPass?.end();
            Promise.all([this.uploadPromise, this.indexPackPromise])
                .then(() => callback())
                .catch((err) => callback(err as Error));
        } else {
            callback();
        }
    }
}

/**
 * Handles git-receive-pack (Push)
 */
export async function handleReceivePack(
    repoPath: string,
    reqBody: Readable | ReadableStream,
    dbRepoPath: string
): Promise<Readable> {
    const storage = await getStorage();
    const inputStream = isReadable(reqBody) ? reqBody : Readable.fromWeb(reqBody as any);

    const { commands, packs } = splitReceivePackStream(inputStream);

    const commandLines: string[] = [];
    const commandPromise = new Promise<void>((resolve, reject) => {
        commands.on('data', (chunk) => commandLines.push(chunk.toString()));
        commands.on('end', resolve);
        commands.on('error', reject);
    });

    const packProcessor = new PackStreamProcessor(repoPath, dbRepoPath, storage);

    await new Promise<void>((resolve, reject) => {
        pipeline(packs, packProcessor).then(resolve).catch(reject);
    });

    await commandPromise;

    if (packProcessor.packHash) {
        const hash = packProcessor.packHash;
        const { tempKey, packKey, idxKey, idxPath } = packProcessor.getFinalPaths(hash);

        logger.info(`[ReceivePack] Pack hash: ${hash}`);

        await storage.move(tempKey, packKey);
        await storage.put(idxKey, await fs.readFile(idxPath));

        // Local Object Availability Logic
        const localPackDir = join(repoPath, "objects", "pack");
        await fs.mkdir(localPackDir, { recursive: true });

        const targetIdx = join(localPackDir, `pack-${hash}.idx`);
        const targetPack = join(localPackDir, `pack-${hash}.pack`);
        const sourcePack = idxPath.replace(".idx", ".pack");

        // Packfile might already be at destination due to index-pack behavior
        try {
            await fs.access(targetPack);
        } catch {
            try { await fs.copyFile(sourcePack, targetPack); } catch { }
        }

        // Index file is definitely in .tmp
        try { await fs.copyFile(idxPath, targetIdx); } catch { }

        // Cleanup
        try { await fs.unlink(idxPath); } catch { }
        try { await fs.unlink(sourcePack); } catch { }

        await updateRefs(repoPath, commandLines);
    } else if (commandLines.length > 0) {
        logger.info(`[ReceivePack] No pack, updating refs only.`);
        await updateRefs(repoPath, commandLines);
    }

    return reportStatus(commandLines);
}

// Stateful PktLine Parser
class PktLineDemuxer extends Transform {
    private buffer: Buffer = Buffer.alloc(0);
    private state: 'LENGTH' | 'DATA' | 'PACK' = 'LENGTH';
    private remainingData: number = 0;

    constructor(private options: { onCommand: (data: Buffer) => void, onPack: (data: Buffer) => void }) {
        super();
    }

    _transform(chunk: Buffer, encoding: string, callback: () => void) {
        if (this.state === 'PACK') {
            this.options.onPack(chunk);
            return callback();
        }

        this.buffer = Buffer.concat([this.buffer, chunk]);

        while (true) {
            if (this.state === 'LENGTH') {
                if (this.buffer.length < 4) break;

                const lenStr = this.buffer.slice(0, 4).toString('utf8');

                if (lenStr === '0000') {
                    const rest = this.buffer.slice(4);
                    if (rest.length > 0) {
                        this.options.onPack(rest);
                    }
                    this.state = 'PACK';
                    this.buffer = Buffer.alloc(0);
                    return callback();
                }

                const len = parseInt(lenStr, 16);
                if (isNaN(len)) {
                    return callback();
                }

                this.remainingData = len - 4;
                this.buffer = this.buffer.slice(4);

                if (this.remainingData === 0) {
                    this.state = 'LENGTH';
                    continue;
                }

                this.state = 'DATA';
            }

            if (this.state === 'DATA') {
                if (this.buffer.length < this.remainingData) break;

                const payload = this.buffer.slice(0, this.remainingData);
                this.options.onCommand(payload);

                this.buffer = this.buffer.slice(this.remainingData);
                this.state = 'LENGTH';
            }
        }
        callback();
    }
}

function splitReceivePackStream(stream: Readable): { commands: Readable; packs: Readable } {
    const commands = new PassThrough();
    const packs = new PassThrough();
    const demux = new PktLineDemuxer({
        onCommand: (d) => commands.write(d),
        onPack: (d) => packs.write(d)
    });

    stream.pipe(demux);

    demux.on('finish', () => {
        commands.end();
        packs.end();
    });

    demux.on('error', (err) => {
        commands.destroy(err);
        packs.destroy(err);
    });

    return { commands, packs };
}

async function updateRefs(repoPath: string, commandLines: string[]) {
    for (const line of commandLines) {
        const parts = line.trim().split(' ');
        if (parts.length < 3) continue;

        const [oldSha, newSha, refName] = parts;
        const cleanRefName = refName.split('\0')[0];

        if (newSha === "0000000000000000000000000000000000000000") {
            await runGit(repoPath, ["update-ref", "-d", cleanRefName, oldSha]);
        } else if (oldSha === "0000000000000000000000000000000000000000") {
            await runGit(repoPath, ["update-ref", cleanRefName, newSha]);
        } else {
            await runGit(repoPath, ["update-ref", cleanRefName, newSha, oldSha]);
        }
    }
}

function reportStatus(commandBuffs: string[], error?: string): Readable {
    const s = new Readable();
    s._read = () => { };

    // Git receive-pack uses sideband protocol (band 2 for status messages)
    const sidebandMsg = (msg: string): Buffer => {
        const band = Buffer.from([0x02]); // Band 2 for progress/status
        const text = Buffer.from(msg, 'utf8');
        const data = Buffer.concat([band, text]);
        const len = data.length + 4;
        const hex = len.toString(16).padStart(4, '0');
        return Buffer.concat([Buffer.from(hex, 'utf8'), data]);
    };

    s.push(sidebandMsg(error ? `unpack ${error}\n` : "unpack ok\n"));

    const seen = new Set<string>();

    for (const line of commandBuffs) {
        const parts = line.trim().split(' ');
        if (parts.length >= 3) {
            const refName = parts[2].split('\0')[0];
            if (!seen.has(refName)) {
                s.push(sidebandMsg(error ? `ng ${refName} ${error}\n` : `ok ${refName}\n`));
                seen.add(refName);
            }
        }
    }
    s.push(flushPkt());
    s.push(null);
    return s;
}

async function runGit(cwd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn("git", args, { cwd });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`git ${args[0]} failed with code ${code}`));
        });
        child.on('error', reject);
    });
}

function isReadable(stream: any): stream is Readable {
    return stream instanceof Readable || (stream && typeof stream.on === 'function');
}
