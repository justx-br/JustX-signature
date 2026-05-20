/**
 * Transient, in-memory store for user-supplied ICP Brasil e-CPF certificates
 * keyed by envelope ID. Used by the JustX qualified-signature flow:
 *
 *   1. JustX backend validates the user's .pfx + password, creates an envelope
 *      via the regular Documenso API, then PUTs the cert here keyed by
 *      envelope_id.
 *   2. The seal-document job, when it runs, calls `consumePerEnvelopeCert`
 *      on the envelope's ID. If a cert is found, it is used to sign the PDF
 *      and atomically removed from the store. Otherwise, signing falls back
 *      to the global platform cert from env vars.
 *   3. Whether or not signing happens, the cert is auto-evicted after its
 *      TTL (default 15 min) so abandoned uploads never linger.
 *
 * Storage is in process memory only — never written to disk or DB. A
 * Map on `globalThis` survives module reloads in development.
 */

type CertEntry = {
  pfx: Uint8Array;
  passphrase: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
};

declare global {
  // eslint-disable-next-line no-var
  var __justx_per_envelope_certs: Map<string, CertEntry> | undefined;
  // eslint-disable-next-line no-var
  var __justx_per_envelope_company_seal: Map<string, CertEntry> | undefined;
}

const store = (): Map<string, CertEntry> => {
  if (!globalThis.__justx_per_envelope_certs) {
    globalThis.__justx_per_envelope_certs = new Map();
  }
  return globalThis.__justx_per_envelope_certs;
};

/**
 * Second, parallel store for the company e-CNPJ co-seal. Lives next to
 * the user-cert store rather than inside it so a single envelope can
 * hold BOTH a user e-CPF (consumed by the primary signer path) AND a
 * company-seal request (consumed by `signPdf` to apply a second signature
 * on top of the first).
 *
 * Used only by the CO_SIGN signing mode. For COMPANY-only signing we
 * register the company cert as if it were a user cert in the primary
 * store, since it replaces (not stacks on top of) the platform default.
 */
const sealStore = (): Map<string, CertEntry> => {
  if (!globalThis.__justx_per_envelope_company_seal) {
    globalThis.__justx_per_envelope_company_seal = new Map();
  }
  return globalThis.__justx_per_envelope_company_seal;
};

const MAX_ACTIVE_ENTRIES = 1000; // soft cap to limit memory pressure under flood
const MIN_TTL_MS = 60 * 1000; // 1 min floor
const MAX_TTL_MS = 60 * 60 * 1000; // 1 hour ceiling

export const putPerEnvelopeCert = (
  envelopeId: string,
  pfx: Uint8Array,
  passphrase: string,
  ttlMs: number,
): void => {
  const map = store();

  if (!map.has(envelopeId) && map.size >= MAX_ACTIVE_ENTRIES) {
    throw new Error('per-envelope cert store is full');
  }

  const existing = map.get(envelopeId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const clampedTtl = Math.min(Math.max(ttlMs, MIN_TTL_MS), MAX_TTL_MS);

  const timer = setTimeout(() => {
    map.delete(envelopeId);
  }, clampedTtl);
  timer.unref?.();

  map.set(envelopeId, {
    pfx,
    passphrase,
    expiresAt: Date.now() + clampedTtl,
    timer,
  });
};

/**
 * Atomically fetch + remove the cert for an envelope. Returns null if no
 * cert is registered (or the entry expired). Use this from the signer
 * path so the cert is destroyed after exactly one signing operation.
 */
export const consumePerEnvelopeCert = (
  envelopeId: string,
): { pfx: Uint8Array; passphrase: string } | null => {
  const map = store();
  const entry = map.get(envelopeId);
  if (!entry) return null;
  clearTimeout(entry.timer);
  map.delete(envelopeId);
  return { pfx: entry.pfx, passphrase: entry.passphrase };
};

/**
 * Explicit deletion endpoint for the JustX backend to call from the
 * Documenso webhook handler as belt-and-suspenders cleanup, in case
 * `consumePerEnvelopeCert` was never invoked (e.g., user abandoned the
 * envelope and the TTL hasn't fired yet).
 */
export const deletePerEnvelopeCert = (envelopeId: string): boolean => {
  const map = store();
  const entry = map.get(envelopeId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  map.delete(envelopeId);
  return true;
};

export const hasPerEnvelopeCert = (envelopeId: string): boolean => store().has(envelopeId);

// ───────────────────── Company-seal store (CO_SIGN) ─────────────────

/**
 * Park the company e-CNPJ co-seal request for an envelope. The bytes
 * are loaded server-side (never travel from the JustX backend) by
 * `loadCompanyCert()` in `company-cert-loader.ts` and stashed here so
 * the `signPdf` flow can pick them up after the primary signature.
 */
export const putCompanySealCert = (
  envelopeId: string,
  pfx: Uint8Array,
  passphrase: string,
  ttlMs: number,
): void => {
  const map = sealStore();

  if (!map.has(envelopeId) && map.size >= MAX_ACTIVE_ENTRIES) {
    throw new Error('per-envelope company-seal store is full');
  }

  const existing = map.get(envelopeId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const clampedTtl = Math.min(Math.max(ttlMs, MIN_TTL_MS), MAX_TTL_MS);

  const timer = setTimeout(() => {
    map.delete(envelopeId);
  }, clampedTtl);
  timer.unref?.();

  map.set(envelopeId, {
    pfx,
    passphrase,
    expiresAt: Date.now() + clampedTtl,
    timer,
  });
};

/**
 * Atomically fetch + remove the company-seal cert for an envelope.
 * Returns null when no company seal was requested for this envelope.
 */
export const consumeCompanySealCert = (
  envelopeId: string,
): { pfx: Uint8Array; passphrase: string } | null => {
  const map = sealStore();
  const entry = map.get(envelopeId);
  if (!entry) return null;
  clearTimeout(entry.timer);
  map.delete(envelopeId);
  return { pfx: entry.pfx, passphrase: entry.passphrase };
};

export const deleteCompanySealCert = (envelopeId: string): boolean => {
  const map = sealStore();
  const entry = map.get(envelopeId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  map.delete(envelopeId);
  return true;
};

export const hasCompanySealCert = (envelopeId: string): boolean => sealStore().has(envelopeId);
