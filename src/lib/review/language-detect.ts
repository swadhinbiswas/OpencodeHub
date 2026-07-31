/**
 * Language & Framework Detection
 * Maps file extensions and patterns to languages and frameworks.
 */

export interface LanguageInfo {
  language: string;
  framework: string | null;
  category: 'code' | 'config' | 'data' | 'documentation' | 'infrastructure';
}

const EXTENSION_MAP: Record<string, { language: string; framework?: string }> = {
  '.ts': { language: 'TypeScript' },
  '.tsx': { language: 'TypeScript', framework: 'React' },
  '.jsx': { language: 'JavaScript', framework: 'React' },
  '.js': { language: 'JavaScript' },
  '.mjs': { language: 'JavaScript' },
  '.cjs': { language: 'JavaScript' },
  '.vue': { language: 'Vue' },
  '.svelte': { language: 'Svelte' },
  '.astro': { language: 'Astro' },
  '.py': { language: 'Python' },
  '.pyi': { language: 'Python' },
  '.rs': { language: 'Rust' },
  '.go': { language: 'Go' },
  '.java': { language: 'Java' },
  '.kt': { language: 'Kotlin' },
  '.rb': { language: 'Ruby' },
  '.php': { language: 'PHP' },
  '.cs': { language: 'C#' },
  '.cpp': { language: 'C++' },
  '.cc': { language: 'C++' },
  '.c': { language: 'C' },
  '.h': { language: 'C/C++' },
  '.hpp': { language: 'C++' },
  '.swift': { language: 'Swift' },
  '.scala': { language: 'Scala' },
  '.ex': { language: 'Elixir' },
  '.exs': { language: 'Elixir' },
  '.erl': { language: 'Erlang' },
  '.hs': { language: 'Haskell' },
  '.ml': { language: 'OCaml' },
  '.clj': { language: 'Clojure' },
  '.lua': { language: 'Lua' },
  '.r': { language: 'R' },
  '.R': { language: 'R' },
  '.m': { language: 'Objective-C' },
  '.dart': { language: 'Dart', framework: 'Flutter' },
  '.zig': { language: 'Zig' },
};

const CONFIG_FILES: Record<string, string> = {
  'package.json': 'Node.js',
  'tsconfig.json': 'TypeScript',
  'vite.config.ts': 'Vite',
  'vite.config.js': 'Vite',
  'astro.config.mjs': 'Astro',
  'tailwind.config.ts': 'Tailwind CSS',
  'tailwind.config.js': 'Tailwind CSS',
  'next.config.js': 'Next.js',
  'next.config.mjs': 'Next.js',
  'nuxt.config.ts': 'Nuxt.js',
  'webpack.config.js': 'Webpack',
  'rollup.config.js': 'Rollup',
  '.eslintrc.js': 'ESLint',
  '.eslintrc.json': 'ESLint',
  'eslint.config.js': 'ESLint',
  'prettier.config.js': 'Prettier',
  '.prettierrc': 'Prettier',
  'jest.config.js': 'Jest',
  'jest.config.ts': 'Jest',
  'vitest.config.ts': 'Vitest',
  'vitest.config.js': 'Vitest',
  'drizzle.config.ts': 'Drizzle ORM',
  'prisma/schema.prisma': 'Prisma',
  'docker-compose.yml': 'Docker',
  'docker-compose.yaml': 'Docker',
  'Dockerfile': 'Docker',
  '.dockerignore': 'Docker',
  'Cargo.toml': 'Rust',
  'go.mod': 'Go',
  'requirements.txt': 'Python',
  'pyproject.toml': 'Python',
  'setup.py': 'Python',
  'Gemfile': 'Ruby',
  'composer.json': 'PHP',
  'pom.xml': 'Java',
  'build.gradle': 'Java',
};

const INFRA_PATTERNS = [
  /dockerfile/i,
  /docker-compose/i,
  /\.tf$/,
  /\.tfvars$/,
  /\.hcl$/,
  /terraform/i,
  /kubernetes/i,
  /\.helm/i,
  /chart\.yaml/i,
  /\.github\/workflows/i,
  /\.gitlab-ci/i,
  /\.circleci/i,
  /nginx\.conf/i,
  /caddy/i,
  /systemd/i,
];

const MIGRATION_PATTERNS = [
  /migrat/i,
  /schema\.(prisma|sql|graphql)/i,
  /\.drizzle/i,
  /alembic/i,
  /flyway/i,
  /liquibase/i,
  /knex/i,
  /sequelize/i,
];

export function detectLanguage(filePath: string): LanguageInfo {
  const fileName = filePath.split('/').pop() || '';
  const ext = '.' + fileName.split('.').pop();

  // Check infrastructure patterns first
  for (const pattern of INFRA_PATTERNS) {
    if (pattern.test(filePath)) {
      return { language: 'Infrastructure', framework: null, category: 'infrastructure' };
    }
  }

  // Check migration patterns
  for (const pattern of MIGRATION_PATTERNS) {
    if (pattern.test(filePath)) {
      return { language: 'Database', framework: null, category: 'data' };
    }
  }

  // Check config files by name
  const configKey = Object.keys(CONFIG_FILES).find(key => filePath.endsWith(key));
  if (configKey) {
    return {
      language: CONFIG_FILES[configKey],
      framework: CONFIG_FILES[configKey],
      category: 'config',
    };
  }

  // Check documentation
  if (/\.(md|mdx|txt|rst|adoc)$/i.test(ext)) {
    return { language: 'Markdown', framework: null, category: 'documentation' };
  }

  // Check data files
  if (/\.(json|yaml|yml|toml|xml|csv|tsv)$/i.test(ext)) {
    return { language: ext.slice(1).toUpperCase(), framework: null, category: 'data' };
  }

  // Check code files
  const extInfo = EXTENSION_MAP[ext];
  if (extInfo) {
    return { language: extInfo.language, framework: extInfo.framework || null, category: 'code' };
  }

  // Shell scripts
  if (/\.(sh|bash|zsh|fish)$/i.test(ext) || fileName === 'Makefile' || fileName === 'justfile') {
    return { language: 'Shell', framework: null, category: 'code' };
  }

  // SQL
  if (/\.sql$/i.test(ext)) {
    return { language: 'SQL', framework: null, category: 'data' };
  }

  // Styles
  if (/\.(css|scss|sass|less|styl)$/i.test(ext)) {
    return { language: 'CSS', framework: null, category: 'code' };
  }

  // Templates
  if (/\.(hbs|ejs|pug|jade|njk|liquid)$/i.test(ext)) {
    return { language: 'Template', framework: null, category: 'code' };
  }

  return { language: 'Unknown', framework: null, category: 'code' };
}

export function detectFrameworkFromContent(content: string): string | null {
  const frameworks: [RegExp, string][] = [
    [/from\s+['"]react['"]|import\s+.*from\s+['"]react['"]/i, 'React'],
    [/from\s+['"]vue['"]|<template>/i, 'Vue'],
    [/from\s+['"]svelte['"]|<script.*>/i, 'Svelte'],
    [/from\s+['"]next\/|getServerSideProps|getStaticProps/i, 'Next.js'],
    [/from\s+['"]nuxt\/|defineNuxt/i, 'Nuxt.js'],
    [/from\s+['"]express['"]|app\.listen\(/i, 'Express'],
    [/from\s+['"]fastify['"]|fastify\(\)/i, 'Fastify'],
    [/from\s+['"]hono['"]|new\s+Hono/i, 'Hono'],
    [/from\s+['"]@nestjs/i, 'NestJS'],
    [/from\s+['"]django|from\s+django/i, 'Django'],
    [/from\s+['"]flask['"]|Flask\(/i, 'Flask'],
    [/from\s+['"]fastapi['"]|FastAPI\(/i, 'FastAPI'],
    [/from\s+['"]rails|class\s+\w+Controller/i, 'Rails'],
    [/from\s+['"]gin['"]|gin\.Default\(\)/i, 'Gin'],
    [/from\s+['"]echo['"]|echo\.New\(\)/i, 'Echo'],
  ];

  for (const [pattern, name] of frameworks) {
    if (pattern.test(content)) return name;
  }
  return null;
}

export function getLanguagesSummary(files: string[]): { language: string; count: number; percentage: number }[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const info = detectLanguage(file);
    counts.set(info.language, (counts.get(info.language) || 0) + 1);
  }
  const total = files.length || 1;
  return Array.from(counts.entries())
    .map(([language, count]) => ({ language, count, percentage: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}
