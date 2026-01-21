# Glossary

Definitions of common terms used within the OpenCodeHub ecosystem.

## Core Concepts

### **Stacked Pull Requests (Stacked PRs)**
A workflow where multiple pull requests are created as a chain of dependencies (e.g., `PR #1` -> `PR #2` -> `PR #3`). This allows developers to break large features into small, reviewable chunks without waiting for the first PR to merge.

### **Merge Queue**
An automated system that manages the merging of Pull Requests. It ensures that PRs are merged in the correct order, runs CI checks on the "optimistic" result of the merge, and prevents broken main branches.

### **Runner**
A background worker (executing in a Docker container) that runs CI/CD jobs defined in GitHub Actions-compatible workflow files.

### **Internal Hook Secret**
A shared secret used to secure communication between the Git Server (which spawns hooks) and the Application Server (which handles logic). It prevents users from spoofing git hook events.

## Components

### **tRPC**
"TypeScript RPC". The protocol used for communication between the Frontend and Backend of OpenCodeHub. It ensures full type safety across the network boundary.

### **Drizzle ORM**
The Object-Relational Mapper used to interact with the database. It allows OpenCodeHub to support multiple database engines (Postgres, MySQL, SQLite) with a single codebase.

### **LFS (Large File Storage)**
A Git extension that replaces large files (audio, video, datasets) with text pointers inside Git, while storing the file contents on a remote server (OpenCodeHub supports S3, GDrive, and Local for this).

## Roles

### **Repository Owner**
The user or organization that created the repository. Has full control over settings, access, and deletion.

### **Collaborator**
A user granted read or write access to a repository.

### **Site Administrator**
A user with global privileges to manage the entire OpenCodeHub instance (users, storage config, system monitoring).
