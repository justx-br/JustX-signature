import { Column, Section, Text } from '../components';

export interface TemplateDocumentPendingProps {
  documentName: string;
}

export const TemplateDocumentPending = ({ documentName }: TemplateDocumentPendingProps) => {
  return (
    <Section>
      <Section className="mb-4">
        <Column align="center">
          <Text className="text-base font-bold text-black">
            {String.fromCharCode(10003)} Aguardando outros
          </Text>
        </Column>
      </Section>

      <Text className="mb-0 text-center text-lg font-semibold text-black">
        &ldquo;{documentName}&rdquo; foi assinado
      </Text>

      <Text className="mx-auto mb-6 mt-1 max-w-[80%] text-center text-base text-slate-400">
        Ainda estamos aguardando outros signatários assinarem este documento.
        <br />
        Notificaremos você assim que estiver pronto.
      </Text>
    </Section>
  );
};

export default TemplateDocumentPending;
