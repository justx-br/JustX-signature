import { useMemo, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import { DocumentDistributionMethod, DocumentStatus, EnvelopeType } from '@prisma/client';
import { SendIcon } from 'lucide-react';
import { useNavigate } from 'react-router';

import { useCurrentEnvelopeEditor } from '@documenso/lib/client-only/providers/envelope-editor-provider';
import { extractDocumentAuthMethods } from '@documenso/lib/utils/document-auth';
import { getRecipientsWithMissingFields } from '@documenso/lib/utils/recipients';
import { trpc as trpcReact } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import { useToast } from '@documenso/ui/primitives/use-toast';

/**
 * Button component that distributes the envelope and redirects directly to the signing page.
 * Used for single-signer flows where no email notification is needed.
 */
export const EnvelopeDirectSignButton = () => {
  const { envelope, syncEnvelope, isAutosaving, autosaveError, flushAutosave } =
    useCurrentEnvelopeEditor();
  const { toast } = useToast();
  const { t } = useLingui();
  const navigate = useNavigate();

  const [isDistributing, setIsDistributing] = useState(false);

  const { mutateAsync: distributeEnvelope } = trpcReact.envelope.distribute.useMutation();

  const recipientsWithIndex = useMemo(
    () =>
      envelope.recipients.map((recipient, index) => ({
        ...recipient,
        index,
      })),
    [envelope.recipients],
  );

  const recipientsMissingSignatureFields = useMemo(
    () => getRecipientsWithMissingFields(recipientsWithIndex, envelope.fields),
    [recipientsWithIndex, envelope.fields],
  );

  const recipientsMissingRequiredEmail = useMemo(() => {
    return recipientsWithIndex.filter((recipient) => {
      const auth = extractDocumentAuthMethods({
        documentAuth: envelope.authOptions,
        recipientAuth: recipient.authOptions,
      });

      return (
        (auth.recipientAccessAuthRequired || auth.recipientActionAuthRequired) && !recipient.email
      );
    });
  }, [recipientsWithIndex, envelope.authOptions]);

  const canDistribute = useMemo(() => {
    return (
      envelope.recipients.length > 0 &&
      recipientsMissingSignatureFields.length === 0 &&
      recipientsMissingRequiredEmail.length === 0
    );
  }, [envelope.recipients, recipientsMissingSignatureFields, recipientsMissingRequiredEmail]);

  const handleDirectSign = async () => {
    if (!canDistribute) {
      if (envelope.recipients.length === 0) {
        toast({
          title: t`Cannot sign`,
          description: t`You need at least one recipient to sign the document.`,
          variant: 'destructive',
        });
      } else if (recipientsMissingSignatureFields.length > 0) {
        toast({
          title: t`Missing signature fields`,
          description: t`Please add signature fields for all signers before continuing.`,
          variant: 'destructive',
        });
      } else if (recipientsMissingRequiredEmail.length > 0) {
        toast({
          title: t`Missing email`,
          description: t`Some recipients require an email address due to authentication settings.`,
          variant: 'destructive',
        });
      }
      return;
    }

    setIsDistributing(true);

    try {
      // Sync any pending changes before distributing
      if (isAutosaving || autosaveError) {
        await syncEnvelope();
      } else {
        await flushAutosave();
      }

      // Distribute with NONE method (no emails sent)
      const result = await distributeEnvelope({
        envelopeId: envelope.id,
        meta: {
          distributionMethod: DocumentDistributionMethod.NONE,
        },
      });

      // Get first recipient's token
      const firstRecipient = result.recipients[0];

      if (!firstRecipient?.token) {
        throw new Error('No signing token returned');
      }

      // Redirect to signing page (autoSign=true triggers the signature dialog immediately)
      const signingPath = `/sign/${firstRecipient.token}?autoSign=true`;

      toast({
        title: t`Document ready`,
        description: t`Redirecting to signing page...`,
        duration: 2000,
      });

      await navigate(signingPath);
    } catch (error) {
      console.error('Direct sign error:', error);
      toast({
        title: t`Something went wrong`,
        description: t`Could not prepare the document for signing. Please try again.`,
        variant: 'destructive',
        duration: 7500,
      });
    } finally {
      setIsDistributing(false);
    }
  };

  // Only show for draft documents
  if (envelope.status !== DocumentStatus.DRAFT || envelope.type !== EnvelopeType.DOCUMENT) {
    return null;
  }

  return (
    <Button
      size="sm"
      onClick={handleDirectSign}
      loading={isDistributing || isAutosaving}
      disabled={!canDistribute}
    >
      <SendIcon className="mr-2 h-4 w-4" />
      <Trans>Assinar</Trans>
    </Button>
  );
};
