import { createWebhook } from '@documenso/lib/server-only/webhooks/create-webhook';
import { deleteWebhookById } from '@documenso/lib/server-only/webhooks/delete-webhook-by-id';
import { editWebhook } from '@documenso/lib/server-only/webhooks/edit-webhook';
import { getWebhookById } from '@documenso/lib/server-only/webhooks/get-webhook-by-id';
import { getWebhooksByTeamId } from '@documenso/lib/server-only/webhooks/get-webhooks-by-team-id';
import { triggerTestWebhook } from '@documenso/lib/server-only/webhooks/trigger-test-webhook';

import type { TrpcContext as Context } from '../context';
import { adminProcedure, router } from '../trpc';
import { findWebhookCallsRoute } from './find-webhook-calls';
import { resendWebhookCallRoute } from './resend-webhook-call';
import {
  ZCreateWebhookRequestSchema,
  ZDeleteWebhookRequestSchema,
  ZEditWebhookRequestSchema,
  ZGetWebhookByIdRequestSchema,
  ZTriggerTestWebhookRequestSchema,
} from './schema';

function requireAuthContext(ctx: Context) {
  if (ctx.teamId == null || ctx.user?.id == null) {
    throw new Error('Unauthorized');
  }

  return {
    teamId: ctx.teamId,
    userId: ctx.user.id,
  };
}

export const webhookRouter = router({
  calls: {
    find: findWebhookCallsRoute,
    resend: resendWebhookCallRoute,
  },

  getTeamWebhooks: adminProcedure.query(async ({ ctx }) => {
    const { teamId, userId } = requireAuthContext(ctx);

    ctx.logger.info({
      input: {
        teamId,
      },
    });

    return await getWebhooksByTeamId(teamId, userId);
  }),

  getWebhookById: adminProcedure
    .input(ZGetWebhookByIdRequestSchema)
    .query(async ({ input, ctx }) => {
      const { id } = input;
      const { teamId, userId } = requireAuthContext(ctx);

      ctx.logger.info({
        input: {
          id,
        },
      });

      return await getWebhookById({
        id,
        userId,
        teamId,
      });
    }),

  createWebhook: adminProcedure
    .input(ZCreateWebhookRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { enabled, eventTriggers, secret, webhookUrl } = input;
      const { teamId, userId } = requireAuthContext(ctx);

      return await createWebhook({
        enabled,
        secret,
        webhookUrl,
        eventTriggers,
        teamId,
        userId,
      });
    }),

  deleteWebhook: adminProcedure
    .input(ZDeleteWebhookRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { id } = input;
      const { teamId, userId } = requireAuthContext(ctx);

      ctx.logger.info({
        input: {
          id,
        },
      });

      return await deleteWebhookById({
        id,
        teamId,
        userId,
      });
    }),

  editWebhook: adminProcedure.input(ZEditWebhookRequestSchema).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input;
    const { teamId, userId } = requireAuthContext(ctx);

    ctx.logger.info({
      input: {
        id,
      },
    });

    return await editWebhook({
      id,
      data,
      userId,
      teamId,
    });
  }),

  testWebhook: adminProcedure
    .input(ZTriggerTestWebhookRequestSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, event } = input;
      const { teamId, userId } = requireAuthContext(ctx);

      ctx.logger.info({
        input: {
          id,
          event,
        },
      });

      return await triggerTestWebhook({
        id,
        event,
        userId,
        teamId,
      });
    }),
});
