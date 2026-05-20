/**
 * Internal API for the JustX backend to register and remove a user-supplied
 * ICP Brasil e-CPF certificate scoped to a single envelope, used by the
 * qualified-signature flow.
 *
 * Protected by NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET (same header pattern
 * as the other /api/internal/justx/* routes).
 *
 *   PUT  /api/internal/justx/register-cert
 *     body: { envelope_id: string|number, pfx_b64: string, passphrase: string, ttl_seconds?: number }
 *
 *   DELETE /api/internal/justx/register-cert/:envelopeId
 *
 * On PUT the cert lives in process memory only, keyed by envelope_id, and is
 * auto-evicted after the TTL (default 15 min, clamped 60s..1h). The seal-
 * document job consumes (atomically removes) the cert on use. DELETE is
 * belt-and-suspenders cleanup for the webhook handler.
 */
import { Hono } from 'hono';

import { env } from '@documenso/lib/utils/env';
import {
  deletePerEnvelopeCert,
  putPerEnvelopeCert,
} from '@documenso/signing/per-envelope-cert-store';

import type { HonoEnv } from '../../router';

const SECRET = env('NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET');
const DEFAULT_TTL_SECONDS = 15 * 60;

const readSecretHeader = (c: { req: { header: (k: string) => string | undefined } }) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return c.req.header('x-justx-provisioning-secret');
};

export const justxRegisterCertRoute = new Hono<HonoEnv>()
  .put('/register-cert', async (c) => {
    const log = c.get('logger')?.child({ route: 'justx/register-cert' }) ?? {
      info: console.log,
      warn: console.warn,
    };

    const provided = readSecretHeader(c);
    if (!SECRET || provided !== SECRET) {
      log.warn({ msg: 'register-cert 401 Unauthorized' });
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let body: {
      envelope_id?: string | number;
      pfx_b64?: string;
      passphrase?: string;
      ttl_seconds?: number;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { envelope_id, pfx_b64, passphrase = '', ttl_seconds } = body;
    if (envelope_id === undefined || envelope_id === null || !pfx_b64) {
      return c.json({ error: 'Missing required fields: envelope_id, pfx_b64' }, 400);
    }

    let pfx: Uint8Array;
    try {
      pfx = Buffer.from(pfx_b64, 'base64');
    } catch {
      return c.json({ error: 'Invalid pfx_b64 (not valid base64)' }, 400);
    }

    if (pfx.length === 0 || pfx.length > 512 * 1024) {
      return c.json({ error: 'pfx_b64 decoded size out of bounds' }, 400);
    }

    const ttlSeconds = Number(ttl_seconds) || DEFAULT_TTL_SECONDS;

    try {
      putPerEnvelopeCert(String(envelope_id), pfx, String(passphrase), ttlSeconds * 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      log.warn({ msg: 'register-cert rejected', details: message });
      return c.json({ error: message }, 503);
    }

    // NB: do NOT log envelope_id values to avoid leaking which envelopes
    // are using the qualified-signature flow vs. the platform cert.
    log.info({ msg: 'register-cert ok', ttl_seconds: ttlSeconds });
    return c.json({ ok: true, expires_in_seconds: ttlSeconds });
  })
  .delete('/register-cert/:envelopeId', (c) => {
    const log = c.get('logger')?.child({ route: 'justx/register-cert' }) ?? {
      info: console.log,
      warn: console.warn,
    };

    const provided = readSecretHeader(c);
    if (!SECRET || provided !== SECRET) {
      log.warn({ msg: 'delete-cert 401 Unauthorized' });
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const envelopeId = c.req.param('envelopeId');
    if (!envelopeId) {
      return c.json({ error: 'Missing envelopeId path parameter' }, 400);
    }

    const deleted = deletePerEnvelopeCert(envelopeId);
    log.info({ msg: 'delete-cert', deleted });
    return c.json({ ok: true, deleted });
  });
