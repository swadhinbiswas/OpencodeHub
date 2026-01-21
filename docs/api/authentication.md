# API Authentication

To interact with the OpenCodeHub API programmatically, you need an API Token.

## Obtaining a Token

Currently, you can obtain a token by logging in via the CLI or inspecting your session.
(Future updates will allow generating persistent Personal Access Tokens (PATs) from the UI settings).

### Via CLI

```bash
och auth login
cat ~/.ochrc
```
The `token` field in your `~/.ochrc` file is a valid Bearer token.

## Using the Token

Pass the token in the HTTP `Authorization` header.

```http
GET /api/users/me HTTP/1.1
Host: git.example.com
Authorization: Bearer eyJhbGciOiJIUz...
```

## Session Cookies

If you are developing a browser-based integration (like a plugin), you can also rely on the standard `och_session` cookie if the user is logged in to the browser.
