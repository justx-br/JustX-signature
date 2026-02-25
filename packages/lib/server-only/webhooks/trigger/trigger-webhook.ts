import type { WebhookTriggerEvents } from '@prisma/client';

import { GLOBAL_WEBHOOK_SECRET, GLOBAL_WEBHOOK_URL } from '../../../constants/app';
import { jobs } from '../../../jobs/client';
import { getAllWebhooksByEventTrigger } from '../get-all-webhooks-by-event-trigger';

export type TriggerWebhookOptions = {
  event: WebhookTriggerEvents;
  data: Record<string, unknown>;
  userId: number;
  teamId: number;
};

export const triggerWebhook = async ({ event, data, userId, teamId }: TriggerWebhookOptions) => {
  try {
    const webhookPromises: Promise<unknown>[] = [];

    // Trigger team-specific webhooks
    const registeredWebhooks = await getAllWebhooksByEventTrigger({ event, userId, teamId });

    registeredWebhooks.forEach((webhook) => {
      webhookPromises.push(
        jobs.triggerJob({
          name: 'internal.execute-webhook',
          payload: {
            event,
            webhookId: webhook.id,
            data,
          },
        }),
      );
    });

    // Trigger global webhook if configured (in addition to team-specific webhooks)
    const globalWebhookUrl = GLOBAL_WEBHOOK_URL();

    if (globalWebhookUrl) {
      webhookPromises.push(
        jobs.triggerJob({
          name: 'internal.execute-global-webhook',
          payload: {
            event,
            webhookUrl: globalWebhookUrl,
            webhookSecret: GLOBAL_WEBHOOK_SECRET(),
            data,
            userId,
            teamId,
          },
        }),
      );
    }

    if (webhookPromises.length > 0) {
      await Promise.allSettled(webhookPromises);
    }
  } catch (err) {
    console.error(err);
    throw new Error(`Failed to trigger webhook`);
  }
};
