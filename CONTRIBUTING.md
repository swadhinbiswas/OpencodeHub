# Contributing to OpenCodeHub

Thank you for your interest in contributing to OpenCodeHub! This document provides guidelines and information about contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 20 or later
- npm or pnpm
- Docker (for running services)
- Git

### Development Setup

1. **Fork the repository**

   Click the "Fork" button on GitHub to create your own copy.

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/opencodehub.git
   cd opencodehub
   ```

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Set up environment**

   ```bash
   cp .env.example .env
   # Edit .env with your local settings
   ```

5. **Start development services**

   ```bash
   # Start database and Redis
   docker-compose up -d postgres redis

   # Run database migrations
   npm run db:migrate
   ```

6. **Start the development server**

   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:4321`

## Project Structure

```
opencodehub/
├── src/
│   ├── components/       # React and Astro components
│   │   ├── ui/          # shadcn/ui components
│   │   ├── layout/      # Layout components
│   │   ├── editor/      # Code editor components
│   │   └── git/         # Git-related components
│   ├── db/              # Database layer
│   │   ├── adapter/     # Universal Database Adapter
│   │   └── schema/      # Drizzle ORM schemas
│   ├── lib/             # Core utilities and services
│   │   ├── auth.ts      # Authentication
│   │   ├── git.ts       # Git operations
│   │   ├── ssh.ts       # SSH server
│   │   ├── pipeline.ts  # CI/CD pipeline
│   │   └── storage.ts   # File storage
│   ├── pages/           # Astro pages and API routes
│   │   ├── api/         # REST API endpoints
│   │   └── [owner]/     # Dynamic repository pages
│   ├── layouts/         # Astro layouts
│   └── styles/          # Global styles
├── scripts/             # Build and utility scripts
├── public/              # Static assets
├── tests/               # Test files
└── docker/              # Docker configuration
```

## Coding Standards

### TypeScript

- Use TypeScript for all code
- Enable strict mode
- Avoid `any` types when possible
- Use interfaces for object types
- Document complex functions with JSDoc

```typescript
/**
 * Creates a new repository for the given user.
 * @param userId - The ID of the user creating the repository
 * @param options - Repository creation options
 * @returns The created repository
 */
export async function createRepository(
  userId: string,
  options: CreateRepositoryOptions
): Promise<Repository> {
  // Implementation
}
```

### React Components

- Use functional components with hooks
- Use TypeScript interfaces for props
- Keep components small and focused
- Use composition over inheritance

```tsx
interface ButtonProps {
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({
  variant = "default",
  size = "md",
  children,
  onClick,
}: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }))} onClick={onClick}>
      {children}
    </button>
  );
}
```

### Astro Pages

- Use `.astro` extension for pages
- Keep pages thin - delegate logic to components
- Use layouts for common structure

### API Routes

- Follow REST conventions
- Use proper HTTP status codes
- Validate input with Zod
- Return consistent response shapes

```typescript
// Good response shape
{
  success: true,
  data: { ... }
}

// Error response
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Invalid email address"
  }
}
```

### Git Commits

- Use conventional commits format:
  - `feat:` New features
  - `fix:` Bug fixes
  - `docs:` Documentation
  - `style:` Code style changes
  - `refactor:` Code refactoring
  - `test:` Tests
  - `chore:` Build/tooling changes

```
feat: add repository forking functionality

- Add fork button to repository page
- Create API endpoint for forking
- Handle fork conflicts

Closes #123
```

## Pull Request Process

1. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**

   - Write clean, well-documented code
   - Add tests for new functionality
   - Update documentation as needed

3. **Run tests and linting**

   ```bash
   npm run lint
   npm run test
   npm run build
   ```

4. **Commit your changes**

   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push to your fork**

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**

   - Provide a clear description of changes
   - Reference any related issues
   - Add screenshots for UI changes
   - Request review from maintainers

### PR Review Checklist

- [ ] Code follows project style guidelines
- [ ] Tests pass and new tests added
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
- [ ] Security considerations addressed
- [ ] Performance impact considered

## Testing

### Unit Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

```typescript
import { describe, it, expect } from "vitest";
import { createRepository } from "../lib/repository";

describe("createRepository", () => {
  it("should create a repository with default settings", async () => {
    const repo = await createRepository("user-1", {
      name: "test-repo",
      description: "A test repository",
    });

    expect(repo.name).toBe("test-repo");
    expect(repo.visibility).toBe("public");
  });

  it("should throw on invalid repository name", async () => {
    await expect(
      createRepository("user-1", { name: "invalid name!" })
    ).rejects.toThrow("Invalid repository name");
  });
});
```

### E2E Tests

```bash
# Run E2E tests
npm run test:e2e
```

## Documentation

### Code Documentation

- Add JSDoc comments to public functions
- Document complex algorithms
- Include usage examples

### README Updates

- Update README for new features
- Keep installation instructions current
- Add to API documentation

### Changelog

- Add entries to CHANGELOG.md
- Follow Keep a Changelog format

## Getting Help

- Open an issue for bugs or features
- Join our Discord community
- Check existing issues and PRs

## Recognition

Contributors are recognized in:

- README.md contributors section
- Release notes
- Special thanks in major releases

Thank you for contributing to OpenCodeHub! 🎉
