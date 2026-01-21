---
title: "REST API Reference: Pull Requests"
description: "OpenAPI definition for managing Pull Requests."
---

OpenCodeHub provides a fully documented REST API. Below is the specification for the Pull Requests endpoints.

```yaml
openapi: 3.0.0
info:
  title: OpenCodeHub API
  version: 1.0.0
paths:
  /api/v1/repos/{owner}/{repo}/pulls:
    get:
      summary: List pull requests
      description: List pull requests for a repository, optionally filtering by state or stack.
      parameters:
        - in: path
          name: owner
          schema:
            type: string
          required: true
          description: The account owner of the repository.
        - in: path
          name: repo
          schema:
            type: string
          required: true
          description: The name of the repository.
        - in: query
          name: state
          schema:
            type: string
            enum: [open, closed, merged, all]
            default: open
          description: Filter by state.
      responses:
        '200':
          description: A list of pull requests.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/PullRequest'
    post:
      summary: Create a pull request
      description: Create a new pull request, optionally as part of a stack.
      parameters:
        - in: path
          name: owner
          schema:
            type: string
          required: true
        - in: path
          name: repo
          schema:
            type: string
          required: true
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - title
                - head
                - base
              properties:
                title:
                  type: string
                body:
                  type: string
                head:
                  type: string
                  description: The name of the branch where your changes are implemented.
                base:
                  type: string
                  description: The name of the branch you want the changes pulled into.
      responses:
        '201':
          description: The created pull request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PullRequest'

components:
  schemas:
    PullRequest:
      type: object
      properties:
        id:
          type: integer
        number:
          type: integer
        state:
          type: string
          enum: [open, closed, merged]
        title:
          type: string
        body:
          type: string
        user:
          $ref: '#/components/schemas/User'
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
    User:
      type: object
      properties:
        id:
          type: integer
        login:
          type: string
        avatar_url:
          type: string
```
