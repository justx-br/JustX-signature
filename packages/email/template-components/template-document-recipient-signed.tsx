import { Column, Section, Text } from '../components';

export interface TemplateDocumentRecipientSignedProps {
  documentName: string;
  recipientName: string;
  recipientEmail: string;
  assetBaseUrl: string;
}

export const TemplateDocumentRecipientSigned = ({
  documentName,
  recipientName,
  recipientEmail,
}: TemplateDocumentRecipientSignedProps) => {
  const recipientReference = recipientName || recipientEmail;

  return (
    <Section>
      <Section className="mb-4">
        <Column align="center">
          <Text className="text-base font-bold text-black">
            {String.fromCharCode(10003)} Concluído
          </Text>
        </Column>
      </Section>

      <Text className="mb-0 text-center text-lg font-semibold text-black">
        {recipientReference} assinou &ldquo;{documentName}&rdquo;
      </Text>

      <Text className="mx-auto mb-6 mt-1 max-w-[80%] text-center text-base text-slate-400">
        {recipientReference} concluiu a assinatura do documento.
      </Text>
    </Section>
  );
};

export default TemplateDocumentRecipientSigned;
