import type { JobRunIO } from '../../client/_internal/job';
import type { TExecuteGlobalWebhookJobDefinition } from './execute-global-webhook';

export const run = async ({
  payload,
}: {
  payload: TExecuteGlobalWebhookJobDefinition;
  io: JobRunIO;
}) => {
  const { event, webhookUrl, webhookSecret, data, userId, teamId } = payload;

  const payloadData = {
    event,
    payload: data,
    createdAt: new Date().toISOString(),
    webhookEndpoint: webhookUrl,
    context: {
      userId,
      teamId,
      isGlobalWebhook: true,
    },
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    body: JSON.stringify(payloadData),
    headers: {
      'Content-Type': 'application/json',
      'X-Documenso-Secret': webhookSecret ?? '',
      'X-Documenso-Global-Webhook': 'true',
    },
  });

  if (!response.ok) {
    console.error(`Global webhook execution failed with status ${response.status}`);
    throw new Error(`Global webhook execution failed with status ${response.status}`);
  }

  return {
    success: response.ok,
    status: response.status,
  };
};
