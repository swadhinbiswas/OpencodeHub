---
title: "System Architecture"
description: "High-level overview of OpenCodeHub's components and data flow."
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

OpenCodeHub is built for performance and scalability, using a modern stack optimized for self-hosting.

## C4 Container Diagram

This diagram visualizes the high-level interaction between the user, the CLI, and the server infrastructure.

C4Container
    title Container diagram for OpenCodeHub System

    Person(developer, "Developer", "Uses CLI and Web UI to manage code")
    
    System_Boundary(c1, "OpenCodeHub Platform") {
        Container(cli, "CLI Tool", "TypeScript, Node.js", "Handles stacking, pushing, and rapid stack manipulation")
        Container(web_app, "Web Application", "Astro, SSR", "Serves UI and handles API requests")
        Container(git_server, "Git Server", "Node.js Stream", "Smart HTTP Protocol handler for cloning/pushing")
        
        ContainerDb(database, "PostgreSQL", "SQL Database", "Stores user data, PR metadata, and Merge Queue state")
        ContainerDb(redis, "Redis", "In-Memory", "Cache, Session Storage & Realtime Pub/Sub")
        ContainerDb(s3, "Object Storage", "S3 / MinIO", "Stores raw Git packfiles and LFS objects")
    }

    Rel(developer, cli, "Uses", "Terminal")
    Rel(developer, web_app, "Visits", "HTTPS")
    
    Rel(cli, web_app, "API Calls", "JSON/REST")
    Rel(cli, git_server, "Git Push/Pull", "HTTPS/Smart Protocol")
    
    Rel(web_app, database, "Reads/Writes", "SQL/Drizzle")
    Rel(web_app, redis, "Uses", "Cache & Sessions")
    
    Rel(git_server, s3, "Streams Objects", "S3 API")
    Rel(web_app, s3, "Reads Objects", "S3 API")

## Component Breakdown

<Tabs>
  <TabItem label="Web App (Astro)">
    The core of the system. Built with **Astro** in SSR mode.
    - **Frontend**: Lightweight, HTML-first pages with islands architecture.
    - **API**: Functional endpoints for the CLI and third-party tools.
    - **Auth**: Lucia Auth for secure session management.
  </TabItem>
  <TabItem label="Git Server">
    A custom implementation of the Git Smart HTTP protocol.
    - **Performance**: Streams packfiles directly to/from S3 without buffering to disk.
    - **Stateless**: Can be scaled horizontally across multiple nodes.
  </TabItem>
  <TabItem label="Storage Layer">
    - **Metadata**: PostgreSQL handles the complex relationships between PRs, comments, and repos.
    - **Git Data**: We treat Git objects as immutable blobs, perfect for S3-compatible storage (AWS, Cloudflare R2, MinIO).
  </TabItem>
</Tabs>
