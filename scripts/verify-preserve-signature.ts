#!/usr/bin/env node

/**
 * Manual verification for the #954 preserve-existing-signature fix.
 *
 * Loads a real signed PDF (e.g. one signed at assinador.iti.br), reports the
 * @libpdf/core detection surface used by the seal handler gate, and writes an
 * incremental-save copy so you can diff the /ByteRange region byte-for-byte.
 *
 * Usage: npx tsx scripts/verify-preserve-signature.ts <input.pdf> [output.pdf]
 */
import { PDF } from '@libpdf/core';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const extractByteRange = (bytes: Uint8Array): string | null => {
  const haystack = Buffer.from(bytes).toString('latin1');
  const match = haystack.match(/\/ByteRange\s*\[[^\]]+\]/);
  return match ? match[0] : null;
};

const main = async () => {
  const [, , inputArg, outputArg] = process.argv;

  if (!inputArg) {
    console.error('Usage: npx tsx scripts/verify-preserve-signature.ts <input.pdf> [output.pdf]');
    process.exit(1);
  }

  const inputPath = resolve(inputArg);
  const outputPath = resolve(outputArg ?? inputArg.replace(/\.pdf$/i, '.preserved.pdf'));

  const inputBytes = readFileSync(inputPath);
  console.log(`\n=== INPUT: ${inputPath} (${inputBytes.length} bytes) ===`);

  const pdfDoc = await PDF.load(inputBytes);
  const hadSignatures = pdfDoc.getForm()?.properties.hasSignatures ?? false;
  const blocker = pdfDoc.canSaveIncrementally();
  const inputByteRange = extractByteRange(inputBytes);

  console.log(`  hasSignatures        : ${hadSignatures}`);
  console.log(`  canSaveIncrementally : ${blocker === null ? 'OK (null)' : blocker}`);
  console.log(`  /ByteRange           : ${inputByteRange ?? '(none)'}`);

  if (!hadSignatures) {
    console.warn('\n⚠  Input has no signature — this script is meant for signed PDFs.');
  }
  if (blocker !== null) {
    console.warn(
      `\n⚠  Input cannot be saved incrementally (blocker=${blocker}). ` +
        'Preserve mode would fall back to the legacy destructive flow.',
    );
  }

  const outBytes = await pdfDoc.save({ incremental: true });
  writeFileSync(outputPath, outBytes);

  console.log(`\n=== OUTPUT: ${outputPath} (${outBytes.length} bytes) ===`);

  const outByteRange = extractByteRange(outBytes);
  const outDoc = await PDF.load(outBytes);
  console.log(`  hasSignatures        : ${outDoc.getForm()?.properties.hasSignatures ?? false}`);
  console.log(`  /ByteRange           : ${outByteRange ?? '(none)'}`);

  const byteRangeMatches = inputByteRange !== null && inputByteRange === outByteRange;
  const originalPrefixPreserved =
    outBytes.length >= inputBytes.length &&
    Buffer.from(outBytes.subarray(0, inputBytes.length)).equals(inputBytes);

  console.log('\n=== VERDICT ===');
  console.log(`  /ByteRange preserved       : ${byteRangeMatches ? 'YES' : 'NO'}`);
  console.log(`  Input bytes prefix intact  : ${originalPrefixPreserved ? 'YES' : 'NO'}`);

  if (!byteRangeMatches || !originalPrefixPreserved) {
    console.error(
      '\n❌  Incremental save did NOT preserve the signed byte range. ' +
        'The existing signature would be invalidated — investigate before shipping.',
    );
    process.exit(2);
  }

  console.log(
    '\n✅  Existing signature bytes preserved. Submit the output PDF to ' +
      'validar.iti.gov.br to confirm the validator recognises the original signature.',
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
