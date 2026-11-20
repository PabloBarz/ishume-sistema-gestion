# ISHUME backend authentication

This phase adds cookie-based JWT authentication, database-backed sessions, and route-level permissions. The external PHP catalog endpoint remains public and unchanged.

## Environment

Add these values to the backend `.env` file; never commit the real secret:

```dotenv
JWT_SECRET=replace-with-a-random-secret-of-at-least-32-bytes
JWT_EXPIRES_IN=15m
AUTH_COOKIE_NAME=ishume_session
AUTH_COOKIE_SAME_SITE=lax
```

Generate a secret locally with Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

The cookie is HttpOnly, uses `Path=/api`, and is Secure by default in production. Set `AUTH_COOKIE_SECURE=true` when HTTPS is terminated in front of the app; `SameSite=None` always requires Secure. JWT lifetime accepts a positive value such as `15m`, `1h`, or `1d`.

## Create the first administrator

After applying the database schema and configuring database/JWT environment variables, run this once from an interactive terminal:

```sh
node scripts/create-admin.js
```

The script prompts for personal details, username, and a password twice without echoing it. The password is bcrypt-hashed. It creates the person and account in one transaction and refuses to run if an active administrator already exists. It is not invoked by the application server.

## Authentication endpoints

- `POST /api/auth/login` — body: `{"username":"...","password":"..."}`; sets the HttpOnly session cookie.
- `GET /api/auth/me` — requires a valid cookie; returns the safe user profile and effective permission codes.
- `POST /api/auth/logout` — requires a valid cookie; revokes the current database session and clears the cookie.

The backend validates the JWT and its `jti_hash` session on each protected request, then checks active user, person, and role records. Permissions are resolved from the database for every protected operation. User-specific grants/denials override role permissions; administrator role code bypasses those exceptions.

The frontend should use same-origin requests. Mutating requests with a cross-site Fetch Metadata header or a mismatched Origin/Referer are rejected. The PHP catalog integration endpoint is not mounted behind this middleware. If the JWT secret is not configured, the process and public integrations remain available, but authentication endpoints fail closed with HTTP 503.

Run the built-in test suite with `npm test` (Node.js `node:test`; no test dependency is added).
