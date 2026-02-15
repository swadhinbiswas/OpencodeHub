#!/bin/bash

# Publish CLI to npm and other registries
set -e

echo "🚀 Preparing to publish OpenCodeHub CLI..."

# Move to CLI directory
cd cli

# 1. Clean and Build
echo "📦 Building..."
bun install
bun run build

# 2. Verify
echo "✅ Verifying..."
bun run test
# bun doesn't have 'pack' yet, using npm for verification only if strict, otherwise skip or keep npm just for this.
# Keeping npm pack for dry-run verification as it's standard.
npm pack --dry-run

# 3. Check Authentication
echo "🔑 Checking npm authentication..."
if ! npm whoami &> /dev/null; then
  echo "❌ You are not logged in to npm."
  echo "👉 Run 'npm login' first."
  exit 1
fi

# 4. Publish
echo "🚀 Publishing to npm..."
# Note: Remove --dry-run to actually publish
bun publish --access public

echo "🎉 Published successfully!"
