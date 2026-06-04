import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type { RecipientRole } from '@prisma/client';
import { OrganisationType } from '@prisma/client';

import { RECIPIENT_ROLES_DESCRIPTION } from '@documenso/lib/constants/recipient-roles';

import { Body, Container, Head, Html, Img, Link, Preview, Section, Text } from '../components';
import { TemplateCustomMessageBody } from '../template-components/template-custom-message-body';
import type { TemplateDocumentInviteProps } from '../template-components/template-document-invite';
import { TemplateDocumentInvite } from '../template-components/template-document-invite';
import { TemplateFooter } from '../template-components/template-footer';

export type DocumentInviteEmailTemplateProps = Partial<TemplateDocumentInviteProps> & {
  customBody?: string;
  role: RecipientRole;
  selfSigner?: boolean;
  teamName?: string;
  teamEmail?: string;
  includeSenderDetails?: boolean;
  organisationType?: OrganisationType;
};

export const DocumentInviteEmailTemplate = ({
  inviterName = 'Lucas Smith',
  inviterEmail = 'lucas@documenso.com',
  documentName = 'Open Source Pledge.pdf',
  signDocumentLink = 'https://documenso.com',
  assetBaseUrl = 'http://localhost:3002',
  customBody,
  role,
  selfSigner = false,
  teamName = '',
  includeSenderDetails,
  organisationType,
}: DocumentInviteEmailTemplateProps) => {
  const { _ } = useLingui();

  const action = _(RECIPIENT_ROLES_DESCRIPTION[role].actionVerb).toLowerCase();

  let previewText = msg`${inviterName} has invited you to ${action} ${documentName}`;

  if (organisationType === OrganisationType.ORGANISATION) {
    previewText = includeSenderDetails
      ? msg`${inviterName} on behalf of "${teamName}" has invited you to ${action} ${documentName}`
      : msg`${teamName} has invited you to ${action} ${documentName}`;
  }

  if (selfSigner) {
    previewText = msg`Please ${action} your document ${documentName}`;
  }

  const getAssetUrl = (path: string) => {
    return new URL(path, assetBaseUrl).toString();
  };

  return (
    <Html>
      <Head />
      <Preview>{_(previewText)}</Preview>

      <Body className="mx-auto my-auto bg-white font-sans">
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
              <TemplateDocumentInvite
                inviterName={inviterName}
                inviterEmail={inviterEmail}
                documentName={documentName}
                signDocumentLink={signDocumentLink}
                role={role}
                selfSigner={selfSigner}
                organisationType={organisationType}
                teamName={teamName}
                includeSenderDetails={includeSenderDetails}
              />
            </Section>

            <Section className="border-t border-slate-100 bg-white px-6 pb-6 text-left">
              {organisationType === OrganisationType.PERSONAL && (
                <Text className="mb-1 text-base font-semibold text-black">
                  {inviterName}{' '}
                  <Link className="font-normal text-slate-400" href={`mailto:${inviterEmail}`}>
                    ({inviterEmail})
                  </Link>
                </Text>
              )}

              <Text className="mt-0 text-sm text-slate-400">
                {customBody ? (
                  <TemplateCustomMessageBody text={customBody} />
                ) : (
                  <>
                    {inviterName} convidou você para {action} o documento &ldquo;{documentName}
                    &rdquo;.
                  </>
                )}
              </Text>
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

export default DocumentInviteEmailTemplate;
