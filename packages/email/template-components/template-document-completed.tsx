import { Trans } from '@lingui/react/macro';

import { Button, Column, Section, Text } from '../components';

export interface TemplateDocumentCompletedProps {
  downloadLink: string;
  documentName: string;
  assetBaseUrl: string;
  customBody?: string;
}

export const TemplateDocumentCompleted = ({
  downloadLink,
  documentName,
  assetBaseUrl,
  customBody,
}: TemplateDocumentCompletedProps) => {
  return (
    <>
      <Section>
        <Section className="mb-4">
          <Column align="center">
            <Text className="text-base font-bold text-black">
              {String.fromCharCode(10003)} <Trans>Completed</Trans>
            </Text>
          </Column>
        </Section>

        <Text className="mb-0 text-center text-lg font-semibold text-black">
          {customBody || <Trans>&ldquo;{documentName}&rdquo; was signed by all signers</Trans>}
        </Text>

        <Text className="my-1 text-center text-base text-slate-400">
          <Trans>Continue by downloading the document.</Trans>
        </Text>

        <Section className="mb-6 mt-8 text-center">
          <Button
            className="rounded-lg bg-black px-6 py-3 text-center text-sm font-medium text-white no-underline"
            href={downloadLink}
          >
            <Trans>Download</Trans>
          </Button>
        </Section>
      </Section>
    </>
  );
};

export default TemplateDocumentCompleted;
