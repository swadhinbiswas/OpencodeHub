/**
 * Workflow Templates Library
 * Pre-defined CI/CD workflow templates for common use cases
 */

import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { repositories } from "@/db/schema/repositories";

/**
 * Workflow template definitions
 */
export const workflowTemplates = pgTable("workflow_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // ci, cd, security, quality, custom
  language: text("language"), // node, python, go, rust, etc.
  content: text("content").notNull(), // YAML workflow content
  isOfficial: boolean("is_official").default(false),
  isPublic: boolean("is_public").default(true),
  createdById: text("created_by_id"),
  downloads: text("downloads").default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Repository workflow files
 */
export const repositoryWorkflows = pgTable("repository_workflows", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  path: text("path").notNull(), // e.g., .github/workflows/ci.yml
  content: text("content").notNull(),
  templateId: text("template_id").references(() => workflowTemplates.id),
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type RepositoryWorkflow = typeof repositoryWorkflows.$inferSelect;

/**
 * Default workflow templates
 */
export const DEFAULT_TEMPLATES: Omit<WorkflowTemplate, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Node.js CI",
    description: "Build and test Node.js projects with npm",
    category: "ci",
    language: "node",
    isOfficial: true,
    isPublic: true,
    createdById: null,
    downloads: "0",
    content: `name: Node.js CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  build:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build --if-present
      - run: npm test
`,
  },
  {
    name: "Python CI",
    description: "Build and test Python projects with pip",
    category: "ci",
    language: "python",
    isOfficial: true,
    isPublic: true,
    createdById: null,
    downloads: "0",
    content: `name: Python CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']
    
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python \${{ matrix.python-version }}
        uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
      - name: Run tests
        run: pytest
`,
  },
  {
    name: "Docker Build & Push",
    description: "Build Docker image and push to registry",
    category: "cd",
    language: null,
    isOfficial: true,
    isPublic: true,
    createdById: null,
    downloads: "0",
    content: `name: Docker Build & Push

on:
  push:
    branches: [main]
    tags: ['v*']

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
`,
  },
  {
    name: "Security Scan",
    description: "Run security scanning with CodeQL and dependency checks",
    category: "security",
    language: null,
    isOfficial: true,
    isPublic: true,
    createdById: null,
    downloads: "0",
    content: `name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 0'

jobs:
  codeql:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript, typescript
      
      - name: Autobuild
        uses: github/codeql-action/autobuild@v3
      
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3

  dependency-review:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
`,
  },
  {
    name: "Go CI",
    description: "Build and test Go projects",
    category: "ci",
    language: "go",
    isOfficial: true,
    isPublic: true,
    createdById: null,
    downloads: "0",
    content: `name: Go CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      
      - name: Build
        run: go build -v ./...
      
      - name: Test
        run: go test -v ./...
      
      - name: Lint
        uses: golangci/golangci-lint-action@v4
`,
  },
  {
    name: "Rust CI",
    description: "Build and test Rust projects with cargo",
    category: "ci",
    language: "rust",
    isOfficial: true,
    isPublic: true,
    createdById: null,
    downloads: "0",
    content: `name: Rust CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

env:
  CARGO_TERM_COLOR: always

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      
      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
      
      - name: Check formatting
        run: cargo fmt --all -- --check
      
      - name: Clippy
        run: cargo clippy -- -D warnings
      
      - name: Build
        run: cargo build --verbose
      
      - name: Run tests
        run: cargo test --verbose
`,
  },
  {
    name: "Release Drafter",
    description: "Automatically draft releases based on PR labels",
    category: "cd",
    language: null,
    isOfficial: true,
    isPublic: true,
    createdById: null,
    downloads: "0",
    content: `name: Release Drafter

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, reopened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  update-release-draft:
    runs-on: ubuntu-latest
    steps:
      - uses: release-drafter/release-drafter@v5
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`,
  },
];

/**
 * Get all available templates
 */
export async function getWorkflowTemplates(options?: {
  category?: string;
  language?: string;
}): Promise<WorkflowTemplate[]> {
  const db = getDatabase();

  try {
    let query = db.query.workflowTemplates?.findMany({
      where: options?.category
        ? eq(schema.workflowTemplates.category, options.category)
        : undefined,
    });

    const templates = await query || [];

    if (options?.language) {
      return templates.filter(t => t.language === options.language);
    }

    return templates;
  } catch {
    // Return default templates if table doesn't exist
    return DEFAULT_TEMPLATES.map((t, i) => ({
      ...t,
      id: `default-${i}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as WorkflowTemplate[];
  }
}

/**
 * Initialize default templates in database
 */
export async function initializeDefaultTemplates(): Promise<void> {
  const db = getDatabase();

  for (const template of DEFAULT_TEMPLATES) {
    try {
      // @ts-expect-error - Drizzle multi-db union type issue
      await db.insert(schema.workflowTemplates).values({
        id: crypto.randomUUID(),
        ...template,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch {
      // Template may already exist
    }
  }

  logger.info("Default workflow templates initialized");
}

/**
 * Apply template to repository
 */
export async function applyTemplateToRepo(options: {
  repositoryId: string;
  templateId: string;
  workflowName?: string;
}): Promise<RepositoryWorkflow> {
  const db = getDatabase();

  // Get template
  let template: WorkflowTemplate | undefined;

  try {
    template = await db.query.workflowTemplates?.findFirst({
      where: eq(schema.workflowTemplates.id, options.templateId),
    });
  } catch {
    // Try default templates
    const defaults = DEFAULT_TEMPLATES.map((t, i) => ({
      ...t,
      id: `default-${i}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    template = defaults.find(t => t.id === options.templateId) as WorkflowTemplate;
  }

  if (!template) {
    throw new Error("Template not found");
  }

  const name = options.workflowName || template.name.toLowerCase().replace(/\s+/g, "-");
  const path = `.github/workflows/${name}.yml`;

  const workflow = {
    id: crypto.randomUUID(),
    repositoryId: options.repositoryId,
    name: template.name,
    path,
    content: template.content,
    templateId: options.templateId,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // @ts-expect-error - Drizzle multi-db union type issue
  await db.insert(schema.repositoryWorkflows).values(workflow);

  // Increment download count
  try {
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.update(schema.workflowTemplates)
      .set({ downloads: String(parseInt(template.downloads || "0") + 1) })
      .where(eq(schema.workflowTemplates.id, options.templateId));
  } catch {
    // Ignore if update fails
  }

  logger.info({
    repositoryId: options.repositoryId,
    templateName: template.name
  }, "Workflow template applied");

  return workflow as RepositoryWorkflow;
}

/**
 * Get repository workflows
 */
export async function getRepositoryWorkflows(repositoryId: string): Promise<RepositoryWorkflow[]> {
  const db = getDatabase();

  try {
    return await db.query.repositoryWorkflows?.findMany({
      where: eq(schema.repositoryWorkflows.repositoryId, repositoryId),
    }) || [];
  } catch {
    return [];
  }
}

/**
 * Create custom template
 */
export async function createCustomTemplate(options: {
  name: string;
  description?: string;
  category: string;
  language?: string;
  content: string;
  createdById: string;
  isPublic?: boolean;
}): Promise<WorkflowTemplate> {
  const db = getDatabase();

  const template = {
    id: crypto.randomUUID(),
    name: options.name,
    description: options.description || null,
    category: options.category,
    language: options.language || null,
    content: options.content,
    isOfficial: false,
    isPublic: options.isPublic ?? false,
    createdById: options.createdById,
    downloads: "0",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // @ts-expect-error - Drizzle multi-db union type issue
  await db.insert(schema.workflowTemplates).values(template);

  logger.info({ templateId: template.id, name: options.name }, "Custom workflow template created");

  return template as WorkflowTemplate;
}

/**
 * Toggle workflow enabled state
 */
export async function toggleWorkflow(workflowId: string, enabled: boolean): Promise<boolean> {
  const db = getDatabase();

  try {
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.update(schema.repositoryWorkflows)
      .set({ isEnabled: enabled, updatedAt: new Date() })
      .where(eq(schema.repositoryWorkflows.id, workflowId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete repository workflow
 */
export async function deleteRepositoryWorkflow(workflowId: string): Promise<boolean> {
  const db = getDatabase();

  try {
    // @ts-expect-error - Drizzle multi-db union type issue
    await db.delete(schema.repositoryWorkflows)
      .where(eq(schema.repositoryWorkflows.id, workflowId));
    return true;
  } catch {
    return false;
  }
}
