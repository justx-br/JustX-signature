import { P12Signer, PDF, type Signer } from '@libpdf/core';
import { match } from 'ts-pattern';

import {
  NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER,
  NEXT_PUBLIC_SIGNING_CONTACT_INFO,
  NEXT_PUBLIC_WEBAPP_URL,
} from '@documenso/lib/constants/app';
import { env } from '@documenso/lib/utils/env';

import { getTimestampAuthority } from './helpers/tsa';
import { consumeCompanySealCert } from './per-envelope-cert-store';
import { createGoogleCloudSigner } from './transports/google-cloud';
import { createLocalSigner } from './transports/local';

export type SignOptions = {
  pdf: PDF;
  /**
   * Optional envelope identifier. When provided AND the JustX backend
   * has registered a user-supplied certificate for that envelope via
   * `/api/internal/justx/register-cert`, the qualified signature uses
   * that cert (atomically consumed) instead of the global platform one.
   *
   * When absent, signing falls back to the platform cert from env vars
   * — the existing Avançada/Basica behavior, unchanged.
   */
  envelopeId?: string;
};

let platformSigner: Signer | null = null;

const getPlatformSigner = async (): Promise<Signer> => {
  if (platformSigner) return platformSigner;

  const transport = env('NEXT_PRIVATE_SIGNING_TRANSPORT') || 'local';

  // eslint-disable-next-line require-atomic-updates
  platformSigner = await match(transport)
    .with('local', async () => await createLocalSigner())
    .with('gcloud-hsm', async () => await createGoogleCloudSigner())
    .otherwise(() => {
      throw new Error(`Unsupported signing transport: ${transport}`);
    });

  return platformSigner;
};

/**
 * Build a fresh per-envelope signer (never memoized) when a user cert
 * is registered for `envelopeId`, otherwise fall back to the memoized
 * platform signer.
 */
const getSignerFor = async (envelopeId?: string): Promise<Signer> => {
  if (envelopeId) {
    const transport = env('NEXT_PRIVATE_SIGNING_TRANSPORT') || 'local';

    if (transport === 'local') {
      // createLocalSigner consumes the registered cert (one-shot). If no
      // cert was registered for this envelope, it returns a signer built
      // from the platform cert.
      return await createLocalSigner(envelopeId);
    }
    // Non-local transports (gcloud-hsm) don't support per-envelope certs;
    // fall back to their normal behavior.
  }

  return await getPlatformSigner();
};

export const signPdf = async ({ pdf, envelopeId }: SignOptions) => {
  // Check for a CO_SIGN company-seal request BEFORE we run the primary
  // signer path. `consumeCompanySealCert` is atomic — if a seal was
  // requested it's removed from the store now so a retried seal job
  // doesn't double-stack signatures on an already-signed PDF.
  const companySeal = envelopeId ? consumeCompanySealCert(envelopeId) : null;

  const signer = await getSignerFor(envelopeId);

  const tsa = getTimestampAuthority();
  const subFilter = NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER()
    ? 'adbe.pkcs7.detached'
    : 'ETSI.CAdES.detached';

  const firstSigResult = await pdf.sign({
    signer,
    signingTime: new Date(),
    reason: companySeal ? 'Assinatura do signatário' : 'Signed by JustX',
    location: NEXT_PUBLIC_WEBAPP_URL(),
    contactInfo: NEXT_PUBLIC_SIGNING_CONTACT_INFO(),
    subFilter,
    timestampAuthority: tsa ?? undefined,
    longTermValidation: !!tsa,
    archivalTimestamp: !!tsa,
  });

  if (!companySeal) {
    return firstSigResult.bytes;
  }

  // CO_SIGN: re-load the signed PDF and apply a second signature with
  // the company e-CNPJ on top. PDF signatures naturally stack as
  // incremental updates — the user's signature remains intact and
  // verifiable, and the company seal is added as a second signature
  // dictionary referencing the byte range that includes signature #1.
  const companySigner = await P12Signer.create(companySeal.pfx, companySeal.passphrase, {
    buildChain: true,
  });

  const reloadedPdf = await PDF.load(firstSigResult.bytes);

  const secondSigResult = await reloadedPdf.sign({
    signer: companySigner,
    signingTime: new Date(),
    reason: 'Selo de plataforma JustX',
    location: NEXT_PUBLIC_WEBAPP_URL(),
    contactInfo: NEXT_PUBLIC_SIGNING_CONTACT_INFO(),
    subFilter,
    timestampAuthority: tsa ?? undefined,
    longTermValidation: !!tsa,
    archivalTimestamp: !!tsa,
  });

  return secondSigResult.bytes;
};
