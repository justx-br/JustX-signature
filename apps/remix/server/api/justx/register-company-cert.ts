/**
 * Internal API for the JustX backend to attach the JustX company e-CNPJ
 * certificate to a single envelope.
 *
 * Unlike `register-cert` (user-supplied e-CPF), the .pfx never crosses
 * this network boundary — it's mounted into the JustX-signature
 * container and loaded server-side. The backend only sends the
 * envelope ID and a mode flag.
 *
 * Protected by NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET (same pattern as
 * sibling routes).
 *
 *   PUT  /api/internal/justx/register-company-cert
 *     body: { envelope_id: string|number, mode: 'sole'|'cosign', ttl_seconds?: number }
 *
 *   DELETE /api/internal/justx/register-company-cert/:envelopeId
 *     body: optional { mode?: 'sole'|'cosign' } — defaults to clearing both stores.
 *
 * Modes:
 *   - sole:   The company cert REPLACES the platform default cert. Used
 *             when the user picked "Certificado JustX" — the resulting
 *             PDF has a single signature from the company e-CNPJ.
 *             Mechanically: writes to the user-cert store so the
 *             primary signer path picks it up.
 *   - cosign: The company cert is applied as a SECOND signature on top
 *             of the user's e-CPF. Used when the user picked "Ambos".
 *             Mechanically: writes to the company-seal store; the
 *             primary user-cert path continues to load the user e-CPF
 *             from `register-cert`.
 */
import { Hono } from 'hono';

import { env } from '@documenso/lib/utils/env';
import {
  CompanyCertNotConfiguredError,
  loadCompanyCert,
} from '@documenso/signing/company-cert-loader';
import {
  deleteCompanySealCert,
  deletePerEnvelopeCert,
  putCompanySealCert,
  putPerEnvelopeCert,
} from '@documenso/signing/per-envelope-cert-store';

import type { HonoEnv } from '../../router';

const SECRET = env('NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET');
const DEFAULT_TTL_SECONDS = 15 * 60;

type Mode = 'sole' | 'cosign';

const readSecretHeader = (c: { req: { header: (k: string) => string | undefined } }) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return c.req.header('x-justx-provisioning-secret');
};

const isValidMode = (value: unknown): value is Mode => value === 'sole' || value === 'cosign';

export const justxRegisterCompanyCertRoute = new Hono<HonoEnv>()
  .put('/register-company-cert', async (c) => {
    const log = c.get('logger')?.child({ route: 'justx/register-company-cert' }) ?? {
      info: console.log,
      warn: console.warn,
    };

    const provided = readSecretHeader(c);
    if (!SECRET || provided !== SECRET) {
      log.warn({ msg: 'register-company-cert 401 Unauthorized' });
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let body: {
      envelope_id?: string | number;
      mode?: unknown;
      ttl_seconds?: number;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { envelope_id, mode, ttl_seconds } = body;
    if (envelope_id === undefined || envelope_id === null) {
      return c.json({ error: 'Missing required field: envelope_id' }, 400);
    }
    if (!isValidMode(mode)) {
      return c.json({ error: "mode must be 'sole' or 'cosign'" }, 400);
    }

    let companyCert: { pfx: Uint8Array; passphrase: string };
    try {
      companyCert = loadCompanyCert();
    } catch (err) {
      if (err instanceof CompanyCertNotConfiguredError) {
        log.warn({ msg: 'company cert not configured', details: err.message });
        return c.json({ error: err.message }, 503);
      }
      throw err;
    }

    const ttlSeconds = Number(ttl_seconds) || DEFAULT_TTL_SECONDS;

    try {
      if (mode === 'sole') {
        // Treat the company cert as the per-envelope user cert so the
        // primary signer path picks it up in place of the platform default.
        putPerEnvelopeCert(
          String(envelope_id),
          companyCert.pfx,
          companyCert.passphrase,
          ttlSeconds * 1000,
        );
      } else {
        // CO_SIGN: stash in the company-seal store; signPdf reads from
        // here after the primary signature to apply the second layer.
        putCompanySealCert(
          String(envelope_id),
          companyCert.pfx,
          companyCert.passphrase,
          ttlSeconds * 1000,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      log.warn({ msg: 'register-company-cert rejected', details: message });
      return c.json({ error: message }, 503);
    }

    // NB: do not log envelope_id values.
    log.info({ msg: 'register-company-cert ok', mode, ttl_seconds: ttlSeconds });
    return c.json({ ok: true, mode, expires_in_seconds: ttlSeconds });
  })
  .delete('/register-company-cert/:envelopeId', async (c) => {
    const log = c.get('logger')?.child({ route: 'justx/register-company-cert' }) ?? {
      info: console.log,
      warn: console.warn,
    };

    const provided = readSecretHeader(c);
    if (!SECRET || provided !== SECRET) {
      log.warn({ msg: 'delete-company-cert 401 Unauthorized' });
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const envelopeId = c.req.param('envelopeId');
    if (!envelopeId) {
      return c.json({ error: 'Missing envelopeId path parameter' }, 400);
    }

    let modeFilter: Mode | undefined;
    try {
      const body: { mode?: unknown } = await c.req.json().catch(() => ({}));
      if (body.mode !== undefined && isValidMode(body.mode)) {
        modeFilter = body.mode;
      }
    } catch {
      // No body / non-JSON body — clear both stores.
    }

    let solDeleted = false;
    let cosignDeleted = false;
    if (modeFilter === undefined || modeFilter === 'sole') {
      solDeleted = deletePerEnvelopeCert(envelopeId);
    }
    if (modeFilter === undefined || modeFilter === 'cosign') {
      cosignDeleted = deleteCompanySealCert(envelopeId);
    }

    log.info({
      msg: 'delete-company-cert',
      sole_deleted: solDeleted,
      cosign_deleted: cosignDeleted,
    });
    return c.json({
      ok: true,
      sole_deleted: solDeleted,
      cosign_deleted: cosignDeleted,
    });
  });
