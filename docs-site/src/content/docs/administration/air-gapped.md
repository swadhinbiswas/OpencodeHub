---
title: "Air-gapped Environments"
---

# Air-gapped Environments

OpenCodeHub can be deployed in fully offline, air-gapped networks.

## Prerequisites
- A local container registry to host the OpenCodeHub Docker image.
- A local NPM/mirror registry if you plan to build from source.

## Deployment Steps
1. On a machine with internet access, pull the required images:
   ```bash
   docker pull ghcr.io/swadhinbiswas/opencodehub:latest
   docker pull postgres:15-alpine
   docker pull redis:7-alpine
   ```
2. Save the images to tar archives:
   ```bash
   docker save ghcr.io/swadhinbiswas/opencodehub:latest -o och.tar
   docker save postgres:15-alpine -o pg.tar
   docker save redis:7-alpine -o redis.tar
   ```
3. Transfer the archives to the air-gapped network via secure media.
4. Load the images on the target machine:
   ```bash
   docker load -i och.tar
   docker load -i pg.tar
   docker load -i redis.tar
   ```

## Configuration Adjustments
- Disable external OAuth providers (GitHub, Google) and rely exclusively on local authentication, LDAP, or an internal SAML provider.
- Disable outbound webhooks pointing to external SaaS platforms.
- Ensure the AI Code Review module is configured to use a `local` provider (e.g., an internal Ollama instance) rather than cloud APIs like OpenAI.
