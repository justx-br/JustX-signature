# Documenso Webhook Configuration

## Overview

Configure Documenso to send webhook events to JustX when documents are signed.

## JustX Endpoint

```
POST https://your-justx-server.com/webhooks/documenso
```

---

## Option 1: Automatic Setup (Recommended for Self-Hosted)

### Environment Variables

Add these to your Documenso `.env` file:

```bash
# JustX Webhook Configuration
JUSTX_WEBHOOK_URL=https://your-justx-server.com/webhooks/documenso
JUSTX_WEBHOOK_SECRET=your-secret-here
```

### Run Database Seed

```bash
# From Documenso root directory
npm run prisma:seed

# Or with pnpm
pnpm prisma:seed
```

The seed will:
1. Find the admin user (`admin@documenso.com`)
2. Create a webhook subscribed to `DOCUMENT_COMPLETED`, `DOCUMENT_SIGNED`, `DOCUMENT_SENT`
3. Configure the secret for verification

**Note:** Run `initial-seed` first if admin user doesn't exist.

---

## Option 2: Manual Setup via UI

### 1. Access Webhook Settings

In Documenso, navigate to:
- **Settings** → **Webhooks**

### 2. Create New Webhook

| Field | Value |
|-------|-------|
| **URL** | `https://your-justx-server.com/webhooks/documenso` |
| **Secret** | Same value as `DOCUMENSO_WEBHOOK_SECRET` in JustX |
| **Events** | `DOCUMENT_COMPLETED` (required), optionally others |

### 3. Events to Subscribe

| Event | Description | Required |
|-------|-------------|----------|
| `DOCUMENT_COMPLETED` | Document fully signed | Yes |
| `DOCUMENT_SIGNED` | Individual signature added | Optional |
| `DOCUMENT_SENT` | Document distributed | Optional |

---

## JustX Environment Variables

```bash
# Required - must match the secret configured in Documenso
DOCUMENSO_WEBHOOK_SECRET=your-secret-here

# Already configured
DOCUMENSO_API_KEY=your-api-key
DOCUMENSO_BASE_URL=http://localhost:3000
DOCUMENSO_WEBAPP_URL=http://localhost:3000
```

---

## Webhook Payload Example

```json
{
  "event": "DOCUMENT_COMPLETED",
  "payload": {
    "id": 123,
    "externalId": "5511999999999",
    "title": "contrato.pdf",
    "status": "COMPLETED",
    "completedAt": "2024-01-01T12:00:00Z",
    "Recipient": [
      {
        "id": 456,
        "name": "User Name",
        "email": "user@example.com",
        "signingStatus": "SIGNED",
        "signedAt": "2024-01-01T12:00:00Z"
      }
    ]
  },
  "createdAt": "2024-01-01T12:00:00Z",
  "webhookEndpoint": "https://your-justx-server.com/webhooks/documenso"
}
```

---

## What Happens on DOCUMENT_COMPLETED

1. JustX validates `X-Documenso-Secret` header
2. Extracts `externalId` (user's WhatsApp phone)
3. Downloads signed PDF via Documenso API
4. Sends PDF to user via WhatsApp

---

## Testing

### Local Development (ngrok)

```bash
# Expose local JustX server
ngrok http 8080

# Use ngrok URL in Documenso webhook config
# https://abc123.ngrok.io/webhooks/documenso
```

### Test Webhook from UI

1. Go to **Settings** → **Webhooks** → Select your webhook
2. Click **Test Webhook**
3. Select an event type to send test payload
4. Check JustX logs for response

### Verify Webhook in Production

1. Sign a document in Documenso
2. Check JustX logs for `[DOCUMENSO]` entries:
   ```
   [DOCUMENSO] Webhook event received
   [DOCUMENSO] Processing webhook event: DOCUMENT_COMPLETED
   [DOCUMENSO] Sending signed document to phone: 5511999999999
   [DOCUMENSO] Signed document sent successfully
   ```

---

## Common Issues

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check `DOCUMENSO_WEBHOOK_SECRET` matches |
| No webhook received | Verify URL is accessible from Documenso server |
| PDF not sent | Check `externalId` is set (user's phone number) |
| Webhook not created | Ensure admin user exists before running seed |

---

## Webhook Call Logs

View webhook delivery history in Documenso:
1. Go to **Settings** → **Webhooks**
2. Click on your webhook
3. View **Webhook Calls** with status, response codes, and payloads
4. **Resend** failed webhooks if needed

---

## Security

- Always use HTTPS for webhook URLs in production
- Use a strong, random secret (32+ characters recommended)
- Verify the `X-Documenso-Secret` header in JustX
- Consider IP whitelisting if possible
