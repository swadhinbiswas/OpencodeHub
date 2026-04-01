import express from 'express';
import { spawn } from 'child_process';
import { z } from 'zod';

// This daemon replaces all synchronous blockages in the event loop by owning the git shell purely asynchronously.
const app = express();
app.use(express.json());

// Strict input validation
const GitRequestSchema = z.object({
  repositoryPath: z.string(),
  command: z.array(z.string()),
  env: z.record(z.string()).optional()
});

app.post('/rpc/git-command', async (req, res) => {
  try {
    const { repositoryPath, command, env } = GitRequestSchema.parse(req.body);
    
    // Security: Only allow explicit git binary to prevent RCE
    if (command[0] !== 'git') {
      return res.status(403).json({ error: "Only pure Git commands are permitted." });
    }

    // Never use execSync - always use spawn to keep the Node event loop alive
    const child = spawn(command[0], command.slice(1), {
      cwd: repositoryPath,
      env: { ...process.env, ...env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => stdout += data.toString());
    child.stderr.on('data', (data) => stderr += data.toString());

    child.on('close', (code) => {
      res.json({
        exitCode: code,
        stdout,
        stderr
      });
    });

  } catch (err) {
    res.status(400).json({ error: "Validation failed or invalid command format." });
  }
});

const PORT = process.env.GIT_RPC_PORT || 9091;
app.listen(PORT, () => console.log(`[Git RPC Daemon] Listening securely on port \${PORT}`));
