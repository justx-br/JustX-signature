import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import fs from 'node:fs';
import path from 'node:path';

import { Body, Container, Head, Html, Img, Preview, Section, Text } from '../components';
import type { TemplateDocumentCompletedProps } from '../template-components/template-document-completed';
import { TemplateDocumentCompleted } from '../template-components/template-document-completed';
import { TemplateFooter } from '../template-components/template-footer';

export type DocumentCompletedEmailTemplateProps = Partial<TemplateDocumentCompletedProps> & {
  customBody?: string;
};

const getJustxWhiteLogoDataUri = (): string | null => {
  const candidates = [
    path.join(process.cwd(), 'public/static/justxwhite.png'),
    path.join(process.cwd(), 'apps/remix/public/static/justxwhite.png'),
  ];

  for (const logoPath of candidates) {
    try {
      if (!fs.existsSync(logoPath)) {
        continue;
      }
      const data = fs.readFileSync(logoPath).toString('base64');
      return `data:image/png;base64,${data}`;
    } catch {
      // try next candidate
    }
  }

  return null;
};

export const DocumentCompletedEmailTemplate = ({
  downloadLink = 'https://documenso.com',
  documentName = 'Open Source Pledge.pdf',
  assetBaseUrl = 'http://localhost:3002',
  customBody,
}: DocumentCompletedEmailTemplateProps) => {
  const { _ } = useLingui();

  const previewText = msg`Completed Document`;

  const justxLogoDataUri = getJustxWhiteLogoDataUri();

  return (
    <Html>
      <Head />
      <Preview>{_(previewText)}</Preview>

      <Body className="mx-auto my-auto font-sans">
        <Section className="bg-white">
          <Container className="mx-auto mb-2 mt-8 max-w-xl overflow-hidden rounded-lg border border-solid border-slate-200">
            <Section className="bg-black px-6 py-5 text-center">
              {justxLogoDataUri ? (
                <Img
                  src={justxLogoDataUri}
                  alt="JustX"
                  className="mx-auto h-8 w-auto max-w-[200px]"
                />
              ) : (
                <Text className="text-center text-2xl font-bold text-white">JustX</Text>
              )}
            </Section>

            <Section className="bg-white p-6 text-center">
              <TemplateDocumentCompleted
                downloadLink={downloadLink}
                documentName={documentName}
                assetBaseUrl={assetBaseUrl}
                customBody={customBody}
              />
            </Section>
          </Container>

          <Container className="mx-auto max-w-xl">
            <TemplateFooter />
          </Container>
        </Section>
      </Body>
    </Html>
  );
};

export default DocumentCompletedEmailTemplate;
