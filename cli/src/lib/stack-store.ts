import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface TrackedBranch {
  name: string;
  parent: string | null;
  commitHash: string;
  prNumber?: number;
  syncedAt: string;
}

export class StackStore {
  private configDir: string;
  private dbPath: string;

  constructor() {
    this.configDir = path.join(os.homedir(), '.config', 'opencodehub');
    this.dbPath = path.join(this.configDir, 'stacks.json');
    this.ensureDb();
  }

  private ensureDb() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    if (!fs.existsSync(this.dbPath)) {
      this.writeDb({ branches: {} });
    }
  }

  private readDb(): { branches: Record<string, TrackedBranch> } {
    try {
      const data = fs.readFileSync(this.dbPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return { branches: {} };
    }
  }

  private writeDb(data: { branches: Record<string, TrackedBranch> }) {
    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2), 'utf8');
  }

  public getBranch(name: string): TrackedBranch | undefined {
    return this.readDb().branches[name];
  }

  public trackBranch(branch: TrackedBranch) {
    const db = this.readDb();
    db.branches[branch.name] = branch;
    this.writeDb(db);
  }

  public updateBranchHash(name: string, commitHash: string) {
    const db = this.readDb();
    if (db.branches[name]) {
      db.branches[name].commitHash = commitHash;
      db.branches[name].syncedAt = new Date().toISOString();
      this.writeDb(db);
    }
  }

  public removeBranch(name: string) {
    const db = this.readDb();
    delete db.branches[name];
    this.writeDb(db);
  }

  public getAllBranches(): TrackedBranch[] {
    return Object.values(this.readDb().branches);
  }
}

export const stackStore = new StackStore();
