import { Body, Container, Head, Html, Img, Preview, Section } from '../components';
import type { TemplateDocumentPendingProps } from '../template-components/template-document-pending';
import { TemplateDocumentPending } from '../template-components/template-document-pending';
import { TemplateFooter } from '../template-components/template-footer';

export type DocumentPendingEmailTemplateProps = Partial<TemplateDocumentPendingProps> & {
  assetBaseUrl?: string;
};

export const DocumentPendingEmailTemplate = ({
  documentName = 'Open Source Pledge.pdf',
  assetBaseUrl = 'http://localhost:3002',
}: DocumentPendingEmailTemplateProps) => {
  const getAssetUrl = (path: string) => {
    return new URL(path, assetBaseUrl).toString();
  };

  return (
    <Html>
      <Head />
      <Preview>Documento aguardando assinatura</Preview>

      <Body className="mx-auto my-auto font-sans">
        <Section className="bg-white">
          <Container className="mx-auto mb-2 mt-8 max-w-xl overflow-hidden rounded-lg border border-solid border-slate-200">
            <Section className="bg-black px-6 py-5 text-center">
              <Img
                src={getAssetUrl('/static/justxwhite.png')}
                alt="JustX"
                className="mx-auto h-8 w-auto max-w-[200px]"
              />
            </Section>

            <Section className="bg-white p-6 text-center">
              <TemplateDocumentPending documentName={documentName} />
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

export default DocumentPendingEmailTemplate;
