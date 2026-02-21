# Documenso Customization: Signature Flow Integration with JustX

## Overview

Customize the Documenso edit page to integrate with JustX WhatsApp signature flow. When a user finishes placing signature fields, instead of using Documenso's normal "Send Document" flow, the system should:

1. Call JustX API to notify that fields are ready
2. Close the window or show a success message
3. JustX will handle sending the signing link via WhatsApp

## JustX API Endpoint

### POST `/documenso/signature-ready`

**Base URL:** `https://your-justx-api.com` (configure as environment variable)

**Request Body:**
```json
{
  "envelope_id": "envelope_abc123xyz",
  "user_phone": "5511999998888",
  "user_name": "João Silva",
  "user_email": "joao@email.com",
  "document_title": "Contrato de Prestação de Serviços"
}
```

**Required Fields:**
- `envelope_id` (string): The Documenso envelope ID
- `user_phone` (string): User's WhatsApp number in international format

**Optional Fields:**
- `user_name` (string): User's name for personalization
- `user_email` (string): User's email
- `document_title` (string): Document title for the WhatsApp message

**Response:**
```json
{
  "ok": true,
  "message": "Signing link sent to WhatsApp",
  "envelope_id": "envelope_abc123xyz"
}
```

## Implementation Steps

### Step 1: Add Environment Variable

Add to Documenso's environment configuration:

```env
JUSTX_API_URL=https://your-justx-api.com
JUSTX_API_SECRET=your-shared-secret  # Optional: for request authentication
```

### Step 2: Locate the Edit Page Component

Find the document edit page component. It's likely in one of these locations:
- `apps/web/src/app/(dashboard)/documents/[id]/edit/page.tsx`
- `apps/web/src/app/(dashboard)/t/[teamUrl]/documents/[id]/edit/page.tsx`
- `apps/web/src/components/document-editor/`

Look for:
- The "Send Document" or "Enviar Documento" button
- A function like `handleSend`, `onSend`, `distributeDocument`, or similar
- The component that triggers envelope distribution

### Step 3: Create JustX Integration Service

Create a new file `apps/web/src/lib/justx-integration.ts`:

```typescript
const JUSTX_API_URL = process.env.JUSTX_API_URL || process.env.NEXT_PUBLIC_JUSTX_API_URL;

interface SignatureReadyPayload {
  envelope_id: string;
  user_phone: string;
  user_name?: string;
  user_email?: string;
  document_title?: string;
}

export async function notifySignatureReady(payload: SignatureReadyPayload): Promise<boolean> {
  if (!JUSTX_API_URL) {
    console.error('JUSTX_API_URL not configured');
    return false;
  }

  try {
    const response = await fetch(`${JUSTX_API_URL}/documenso/signature-ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add authentication header if using shared secret
        // 'X-JustX-Secret': process.env.JUSTX_API_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('JustX API error:', error);
      return false;
    }

    const result = await response.json();
    return result.ok === true;
  } catch (error) {
    console.error('Failed to notify JustX:', error);
    return false;
  }
}
```

### Step 4: Modify the Send Button Logic

Find the send/distribute button handler and modify it:

**Before (example):**
```typescript
const handleSendDocument = async () => {
  await distributeEnvelope(envelopeId);
  router.push('/documents');
};
```

**After:**
```typescript
import { notifySignatureReady } from '@/lib/justx-integration';

const handleSendDocument = async () => {
  // Get user info from context/session
  const userPhone = recipient?.phone || externalId; // external_id contains phone
  const userName = recipient?.name;
  const userEmail = recipient?.email;

  // Notify JustX instead of normal distribution
  const success = await notifySignatureReady({
    envelope_id: envelopeId,
    user_phone: userPhone,
    user_name: userName,
    user_email: userEmail,
    document_title: envelope?.title,
  });

  if (success) {
    // Show success message
    toast.success('Documento enviado! Você receberá o link para assinar no WhatsApp.');

    // Option 1: Close window (if opened as popup)
    if (window.opener) {
      window.close();
    } else {
      // Option 2: Redirect to success page or show modal
      router.push('/signature-sent');
    }
  } else {
    toast.error('Erro ao enviar documento. Tente novamente.');
  }
};
```

### Step 5: Get User Phone from Envelope

The user's phone number is stored in the envelope's `external_id` field (set by JustX when creating the envelope).

```typescript
// The external_id contains the user's phone number
const envelope = await getEnvelope(envelopeId);
const userPhone = envelope.externalId; // e.g., "5511999998888"
```

### Step 6: Create Success Page (Optional)

Create a simple success page at `apps/web/src/app/signature-sent/page.tsx`:

```typescript
export default function SignatureSentPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-green-600">
          ✅ Documento Preparado!
        </h1>
        <p className="mt-4 text-gray-600">
          Você receberá o link para assinar no seu WhatsApp em instantes.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Pode fechar esta janela.
        </p>
      </div>
    </div>
  );
}
```

### Step 7: Conditional Behavior (Optional)

If you want to keep the normal Documenso flow for some cases and only use JustX integration for WhatsApp users:

```typescript
const handleSendDocument = async () => {
  // Check if this is a JustX/WhatsApp user (has phone in external_id)
  const isJustXUser = envelope.externalId && /^\d+$/.test(envelope.externalId);

  if (isJustXUser) {
    // JustX flow
    await notifySignatureReady({
      envelope_id: envelopeId,
      user_phone: envelope.externalId,
      user_name: recipient?.name,
      user_email: recipient?.email,
      document_title: envelope?.title,
    });
    toast.success('Link de assinatura enviado para seu WhatsApp!');
    window.close();
  } else {
    // Normal Documenso flow
    await distributeEnvelope(envelopeId);
    router.push('/documents');
  }
};
```

## Testing

### 1. Test the JustX Endpoint

```bash
curl -X POST https://your-justx-api.com/documenso/signature-ready \
  -H "Content-Type: application/json" \
  -d '{
    "envelope_id": "test_envelope_123",
    "user_phone": "5511999998888",
    "user_name": "Test User",
    "document_title": "Test Document"
  }'
```

### 2. Test the Full Flow

1. Create an envelope via JustX (upload document via WhatsApp)
2. Open the edit URL in browser (logged into Documenso)
3. Place signature field(s)
4. Click the modified "Send" button
5. Verify:
   - JustX endpoint receives the callback
   - Envelope is distributed
   - Signing link is sent via WhatsApp
   - User can sign via the link

## Notes

- The `external_id` field in Documenso envelopes is set by JustX to the user's phone number
- JustX handles envelope distribution after receiving the callback
- The signing link sent via WhatsApp uses Documenso's embedded signing with presign token
- Make sure CORS is configured if JustX API is on a different domain

## Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  WhatsApp   │     │   JustX     │     │  Documenso  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │ Upload document   │                   │
       │──────────────────>│                   │
       │                   │                   │
       │                   │ Create envelope   │
       │                   │ (DRAFT status)    │
       │                   │──────────────────>│
       │                   │                   │
       │                   │ Return edit URL   │
       │                   │<──────────────────│
       │                   │                   │
       │ Send edit link    │                   │
       │<──────────────────│                   │
       │                   │                   │
       │ User opens edit   │                   │
       │ page, places      │                   │
       │ signature fields  │                   │
       │─────────────────────────────────────>│
       │                   │                   │
       │                   │ POST /signature-  │
       │                   │ ready callback    │
       │                   │<──────────────────│
       │                   │                   │
       │                   │ Distribute        │
       │                   │ envelope          │
       │                   │──────────────────>│
       │                   │                   │
       │                   │ Get signing URL   │
       │                   │<──────────────────│
       │                   │                   │
       │ Send signing link │                   │
       │<──────────────────│                   │
       │                   │                   │
       │ User signs        │                   │
       │─────────────────────────────────────>│
       │                   │                   │
       │                   │ Webhook:          │
       │                   │ DOCUMENT_COMPLETED│
       │                   │<──────────────────│
       │                   │                   │
       │ Send signed doc   │                   │
       │<──────────────────│                   │
       │                   │                   │
```

## Implementation (Done)

- **JustX integration:** `packages/lib/utils/justx.ts` – `notifySignatureReady()`, `isJustXEnvelope()`
- **Env vars:** `JUSTX_API_URL` or `NEXT_PUBLIC_JUSTX_API_URL`; optional `JUSTX_API_SECRET` / `NEXT_PRIVATE_JUSTX_API_SECRET` (see `packages/tsconfig/process-env.d.ts`)
- **Send flow:** `apps/remix/app/components/dialogs/envelope-distribute-dialog.tsx` – when envelope `externalId` is numeric (phone), POST to JustX `/documenso/signature-ready` then show success and redirect or close; otherwise normal distribute
- **Success page:** `apps/remix/app/routes/_authenticated+/t.$teamUrl+/documents.signature-sent.tsx` – shows "Documento preparado!" and link back to documents
