import { WebhookTriggerEvents } from '@prisma/client';
import { z } from 'zod';

import { ZRequestMetadataSchema } from '../../../universal/extract-request-metadata';
import { type JobDefinition } from '../../client/_internal/job';

const EXECUTE_GLOBAL_WEBHOOK_JOB_DEFINITION_ID = 'internal.execute-global-webhook';

const EXECUTE_GLOBAL_WEBHOOK_JOB_DEFINITION_SCHEMA = z.object({
  event: z.nativeEnum(WebhookTriggerEvents),
  webhookUrl: z.string(),
  webhookSecret: z.string().optional(),
  data: z.unknown(),
  userId: z.number(),
  teamId: z.number(),
  requestMetadata: ZRequestMetadataSchema.optional(),
});

export type TExecuteGlobalWebhookJobDefinition = z.infer<
  typeof EXECUTE_GLOBAL_WEBHOOK_JOB_DEFINITION_SCHEMA
>;

export const EXECUTE_GLOBAL_WEBHOOK_JOB_DEFINITION = {
  id: EXECUTE_GLOBAL_WEBHOOK_JOB_DEFINITION_ID,
  name: 'Execute Global Webhook',
  version: '1.0.0',
  trigger: {
    name: EXECUTE_GLOBAL_WEBHOOK_JOB_DEFINITION_ID,
    schema: EXECUTE_GLOBAL_WEBHOOK_JOB_DEFINITION_SCHEMA,
  },
  handler: async ({ payload, io }) => {
    const handler = await import('./execute-global-webhook.handler');

    await handler.run({ payload, io });
  },
} as const satisfies JobDefinition<
  typeof EXECUTE_GLOBAL_WEBHOOK_JOB_DEFINITION_ID,
  TExecuteGlobalWebhookJobDefinition
>;
