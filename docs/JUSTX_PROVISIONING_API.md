# JustX Provisioning API

Internal API that allows the JustX backend to create Documenso users programmatically during web signup.

## Endpoint

```
POST /api/internal/justx/create-user
```

### Authentication

One of:
- Header `Authorization: Bearer <secret>`
- Header `x-justx-provisioning-secret: <secret>`

The secret must match the `NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET` environment variable.

### Request body

```json
{
  "name": "User Name",
  "email": "user@example.com",
  "password": "plaintext-password"
}
```

All three fields are required.

### Response (200)

```json
{
  "user_id": 5,
  "api_token": "api_xxxxxxxxxxxxxxxx",
  "team_url": "slug-for-team"
}
```

- `user_id` — Documenso user ID (integer).
- `api_token` — Plain-text API token (only returned once; stored hashed in `ApiToken` table).
- `team_url` — URL slug of the user's personal team (used for "My Documents" redirect).

### Error responses

| Status | Condition |
|--------|-----------|
| 400 | Invalid JSON or missing fields |
| 401 | Missing or invalid provisioning secret |
| 422 | User creation failed (e.g. user already exists with token) |

### Behavior for existing users

- **User exists, no token**: creates a new API token and returns it.
- **User exists, has token**: returns 422 with `"User ... already exists and has an API token"`. To re-provision, delete existing tokens first (`DELETE FROM "ApiToken" WHERE "userId" = X`) and call again.
- **User does not exist**: creates user, personal organisation, team, and API token.

## Architecture

The route is a **Hono handler** registered in the server router, not a Remix route.

```
apps/remix/server/router.ts
  └── app.route('/api/internal/justx', justxCreateUserRoute)

apps/remix/server/api/justx/create-user.ts
  └── Hono POST /create-user → createUserWithToken()

packages/lib/server-only/admin/create-user-with-token.ts
  └── Creates User → Organisation → Team → ApiToken (hashed)
```

## Environment variable

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET` | Yes | Shared secret for authenticating JustX requests |

This must match the `DOCUMENSO_PROVISIONING_SECRET` configured in the JustX backend.

## Files

| File | Purpose |
|------|---------|
| `apps/remix/server/api/justx/create-user.ts` | Hono route handler |
| `apps/remix/server/router.ts` | Mounts the route at `/api/internal/justx` |
| `packages/lib/server-only/admin/create-user-with-token.ts` | Core logic: create user + org + team + token |

## Testing manually

```bash
curl -X POST http://localhost:3000/api/internal/justx/create-user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{"name": "Test User", "email": "test@example.com", "password": "test123"}'
```

## Re-provisioning an existing user

If the token was lost or became invalid:

1. Delete existing tokens in the Documenso database:
   ```sql
   DELETE FROM "ApiToken" WHERE "userId" = <documenso_user_id>;
   ```

2. Call the provisioning endpoint again (same email). It will create a fresh token.

3. Update the JustX `documenso_user_map` with the new `api_token` and `team_url`.
