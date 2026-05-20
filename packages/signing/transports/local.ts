import { P12Signer } from '@libpdf/core';
import * as fs from 'node:fs';

import { env } from '@documenso/lib/utils/env';

import { consumePerEnvelopeCert } from '../per-envelope-cert-store';

const loadP12 = (): Uint8Array => {
  const localFileContents = env('NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS');

  if (localFileContents) {
    return Buffer.from(localFileContents, 'base64');
  }

  const localFilePath = env('NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH');

  if (localFilePath) {
    return fs.readFileSync(localFilePath);
  }

  if (env('NODE_ENV') !== 'production') {
    return fs.readFileSync('./example/cert.p12');
  }

  throw new Error('No certificate found for local signing');
};

/**
 * Build a P12Signer.
 *
 * When `envelopeId` is provided and the JustX backend has registered a
 * user-supplied .pfx for that envelope (qualified-signature flow), use it
 * and consume the entry from the in-memory store. Otherwise fall back to
 * the global platform certificate loaded from env vars.
 *
 * Per-envelope signers are NOT memoized — each call constructs a fresh
 * `P12Signer` from the registered bytes, which are then dropped from the
 * store. The platform signer is memoized at the higher `getSigner()`
 * layer in `packages/signing/index.ts`.
 */
export const createLocalSigner = async (envelopeId?: string) => {
  if (envelopeId) {
    const userCert = consumePerEnvelopeCert(envelopeId);
    if (userCert) {
      return await P12Signer.create(userCert.pfx, userCert.passphrase, {
        buildChain: true,
      });
    }
  }

  const p12 = loadP12();

  return await P12Signer.create(p12, env('NEXT_PRIVATE_SIGNING_PASSPHRASE') || '', {
    buildChain: true,
  });
};
