import { useLingui } from '@lingui/react';
import { OrganisationType, RecipientRole } from '@prisma/client';
import { P, match } from 'ts-pattern';

import { RECIPIENT_ROLES_DESCRIPTION } from '@documenso/lib/constants/recipient-roles';

import { Button, Section, Text } from '../components';

export interface TemplateDocumentInviteProps {
  inviterName: string;
  inviterEmail: string;
  documentName: string;
  signDocumentLink: string;
  role: RecipientRole;
  selfSigner: boolean;
  teamName?: string;
  includeSenderDetails?: boolean;
  organisationType?: OrganisationType;
}

export const TemplateDocumentInvite = ({
  inviterName,
  documentName,
  signDocumentLink,
  role,
  selfSigner,
  teamName,
  includeSenderDetails,
  organisationType,
}: TemplateDocumentInviteProps) => {
  const { _ } = useLingui();

  const { actionVerb } = RECIPIENT_ROLES_DESCRIPTION[role];

  return (
    <Section>
      <Text className="mx-auto mb-0 max-w-[80%] text-center text-lg font-semibold text-black">
        {match({ selfSigner, organisationType, includeSenderDetails, teamName })
          .with({ selfSigner: true }, () => (
            <>
              Por favor, {_(actionVerb).toLowerCase()} seu documento
              <br />
              &ldquo;{documentName}&rdquo;
            </>
          ))
          .with(
            {
              organisationType: OrganisationType.ORGANISATION,
              includeSenderDetails: true,
              teamName: P.string,
            },
            () => (
              <>
                {inviterName} em nome de &ldquo;{teamName}&rdquo; convidou você para{' '}
                {_(actionVerb).toLowerCase()}
                <br />
                &ldquo;{documentName}&rdquo;
              </>
            ),
          )
          .with({ organisationType: OrganisationType.ORGANISATION, teamName: P.string }, () => (
            <>
              {teamName} convidou você para {_(actionVerb).toLowerCase()}
              <br />
              &ldquo;{documentName}&rdquo;
            </>
          ))
          .otherwise(() => (
            <>
              {inviterName} convidou você para {_(actionVerb).toLowerCase()}
              <br />
              &ldquo;{documentName}&rdquo;
            </>
          ))}
      </Text>

      <Text className="my-1 text-center text-base text-slate-400">
        {match(role)
          .with(RecipientRole.SIGNER, () => 'Continue assinando o documento.')
          .with(RecipientRole.VIEWER, () => 'Continue visualizando o documento.')
          .with(RecipientRole.APPROVER, () => 'Continue aprovando o documento.')
          .with(RecipientRole.CC, () => '')
          .with(RecipientRole.ASSISTANT, () => 'Continue auxiliando com o documento.')
          .exhaustive()}
      </Text>

      <Section className="mb-6 mt-8 text-center">
        <Button
          className="rounded-lg bg-black px-6 py-3 text-center text-sm font-medium text-white no-underline"
          href={signDocumentLink}
        >
          {match(role)
            .with(RecipientRole.SIGNER, () => 'Visualizar Documento para assinar')
            .with(RecipientRole.VIEWER, () => 'Visualizar Documento')
            .with(RecipientRole.APPROVER, () => 'Visualizar Documento para aprovar')
            .with(RecipientRole.CC, () => '')
            .with(RecipientRole.ASSISTANT, () => 'Visualizar Documento para auxiliar')
            .exhaustive()}
        </Button>
      </Section>
    </Section>
  );
};

export default TemplateDocumentInvite;
