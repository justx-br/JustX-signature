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
  customBody,
}: TemplateDocumentCompletedProps) => {
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
        {customBody || <>&ldquo;{documentName}&rdquo; foi assinado por todos os signatários</>}
      </Text>

      <Text className="my-1 text-center text-base text-slate-400">
        Continue baixando o documento.
      </Text>

      <Section className="mb-6 mt-8 text-center">
        <Button
          className="rounded-lg bg-black px-6 py-3 text-center text-sm font-medium text-white no-underline"
          href={downloadLink}
        >
          Baixar
        </Button>
      </Section>
    </Section>
  );
};

export default TemplateDocumentCompleted;
