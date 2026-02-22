/**
 * Webhook seed for JustX integration.
 *
 * This seed creates a webhook for the JustX service to receive document completion events.
 * Configure via environment variables:
 *   - JUSTX_WEBHOOK_URL: The URL where JustX receives webhooks (e.g., https://your-server.com/webhooks/documenso)
 *   - JUSTX_WEBHOOK_SECRET: The secret used to verify webhook authenticity
 */

import { prisma } from '..';
import { WebhookTriggerEvents } from '../client';

const JUSTX_WEBHOOK_URL = process.env.JUSTX_WEBHOOK_URL;
const JUSTX_WEBHOOK_SECRET = process.env.JUSTX_WEBHOOK_SECRET;

export const seedDatabase = async () => {
  // Skip if environment variables not configured
  if (!JUSTX_WEBHOOK_URL) {
    console.log('[WEBHOOK SEED]: JUSTX_WEBHOOK_URL not configured, skipping webhook seed');
    return;
  }

  // Find the admin user to attach the webhook to
  const adminUser = await prisma.user.findFirst({
    where: {
      email: 'admin@documenso.com',
    },
    include: {
      organisations: {
        include: {
          teams: true,
        },
      },
    },
  });

  if (!adminUser) {
    console.log('[WEBHOOK SEED]: Admin user not found, skipping webhook seed');
    console.log('[WEBHOOK SEED]: Run the initial-seed first to create the admin user');
    return;
  }

  const team = adminUser.organisations[0]?.teams[0];

  if (!team) {
    console.log('[WEBHOOK SEED]: No team found for admin user, skipping webhook seed');
    return;
  }

  // Check if webhook already exists
  const existingWebhook = await prisma.webhook.findFirst({
    where: {
      webhookUrl: JUSTX_WEBHOOK_URL,
      userId: adminUser.id,
      teamId: team.id,
    },
  });

  if (existingWebhook) {
    console.log('[WEBHOOK SEED]: JustX webhook already exists, updating...');

    await prisma.webhook.update({
      where: {
        id: existingWebhook.id,
      },
      data: {
        secret: JUSTX_WEBHOOK_SECRET || null,
        eventTriggers: [
          WebhookTriggerEvents.DOCUMENT_COMPLETED,
          WebhookTriggerEvents.DOCUMENT_SIGNED,
          WebhookTriggerEvents.DOCUMENT_SENT,
        ],
        enabled: true,
      },
    });

    console.log('[WEBHOOK SEED]: JustX webhook updated successfully');
    return;
  }

  // Create the webhook
  await prisma.webhook.create({
    data: {
      webhookUrl: JUSTX_WEBHOOK_URL,
      secret: JUSTX_WEBHOOK_SECRET || null,
      eventTriggers: [
        WebhookTriggerEvents.DOCUMENT_COMPLETED,
        WebhookTriggerEvents.DOCUMENT_SIGNED,
        WebhookTriggerEvents.DOCUMENT_SENT,
      ],
      enabled: true,
      userId: adminUser.id,
      teamId: team.id,
    },
  });

  console.log('[WEBHOOK SEED]: JustX webhook created successfully');
  console.log(`[WEBHOOK SEED]: URL: ${JUSTX_WEBHOOK_URL}`);
  console.log(`[WEBHOOK SEED]: Events: DOCUMENT_COMPLETED, DOCUMENT_SIGNED, DOCUMENT_SENT`);
};
