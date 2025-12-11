#!/bin/sh
set -e

# Run git server initialization
echo "Initializing git server..."
bun run git:init

# Run database migrations
echo "Running database migrations..."
bun run db:migrate

# Start the application
echo "Starting application..."
exec "$@"
