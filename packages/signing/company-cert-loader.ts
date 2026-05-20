/**
 * Loader for the JustX company e-CNPJ certificate.
 *
 * Unlike the per-envelope user cert (which is supplied by the JustX
 * backend over HTTP per request), the company cert is mounted into this
 * container as a read-only file and never crosses a network boundary
 * between the JustX backend and JustX-signature.
 *
 * The bytes and passphrase are loaded lazily on first use and cached
 * for the lifetime of the process. The PKCS#12 contents are never
 * exposed via API responses or logs.
 *
 * Used by the `register-company-cert` endpoint to attach the company
 * cert to an envelope so the seal job applies it either as the sole
 * signature (replacing the platform default) or as a second signature
 * stacked on top of the user's e-CPF.
 *
 * Env vars:
 *   NEXT_PRIVATE_COMPANY_CERT_FILE_PATH    Absolute in-container path
 *                                          to the .pfx. Defaults to
 *                                          /opt/documenso-secrets/company-ecnpj.pfx.
 *   NEXT_PRIVATE_COMPANY_CERT_PASSPHRASE   PKCS#12 password. Required.
 */
import * as fs from 'node:fs';

import { env } from '@documenso/lib/utils/env';

type CompanyCert = {
  pfx: Uint8Array;
  passphrase: string;
};

let cached: CompanyCert | null = null;

const DEFAULT_COMPANY_CERT_PATH = '/opt/documenso-secrets/company-ecnpj.pfx';

export class CompanyCertNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompanyCertNotConfiguredError';
  }
}

/**
 * Read the company e-CNPJ .pfx from disk and cache it for the process
 * lifetime. Throws `CompanyCertNotConfiguredError` when the file or
 * passphrase is missing — the calling endpoint should turn that into a
 * 503 so the JustX backend can fall back gracefully.
 */
export const loadCompanyCert = (): CompanyCert => {
  if (cached) return cached;

  const filePath = env('NEXT_PRIVATE_COMPANY_CERT_FILE_PATH') || DEFAULT_COMPANY_CERT_PATH;
  const passphrase = env('NEXT_PRIVATE_COMPANY_CERT_PASSPHRASE');

  if (!passphrase) {
    throw new CompanyCertNotConfiguredError(
      'NEXT_PRIVATE_COMPANY_CERT_PASSPHRASE is not set — company e-CNPJ unavailable',
    );
  }

  let pfx: Uint8Array;
  try {
    pfx = fs.readFileSync(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    throw new CompanyCertNotConfiguredError(
      `Failed to read company cert at ${filePath}: ${message}`,
    );
  }

  if (pfx.length === 0) {
    throw new CompanyCertNotConfiguredError(`Company cert at ${filePath} is empty`);
  }

  cached = { pfx, passphrase };
  return cached;
};

/**
 * Test-only escape hatch to drop the cached cert (e.g., between tests
 * or after a hot-reload of the .pfx). Production code should never
 * call this.
 */
export const __resetCompanyCertCache = (): void => {
  cached = null;
};
