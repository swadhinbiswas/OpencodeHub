# API Versioning

OpenCodeHub provides a stable REST API and GraphQL endpoint. 

## Versioning Strategy
Currently, the REST API does not have explicit `/v1/` prefixes in the route paths. Instead, the API follows a continuous evolution model where breaking changes are heavily minimized.

When breaking changes are unavoidable:
- They will be announced in the release notes.
- A deprecation header (`Deprecation: <date>`) will be added to the response of the old endpoint.
- Clients will have at least one minor release cycle to migrate.

## GraphQL
The GraphQL API inherently supports seamless evolution by deprecating specific fields using the `@deprecated` directive, allowing clients to transition without breaking version changes.
