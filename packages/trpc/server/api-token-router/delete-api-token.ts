import { deleteTokenById } from '@documenso/lib/server-only/public-api/delete-api-token-by-id';

import { adminProcedure } from '../trpc';
import {
  ZDeleteApiTokenRequestSchema,
  ZDeleteApiTokenResponseSchema,
} from './delete-api-token.types';

export const deleteApiTokenRoute = adminProcedure
  .input(ZDeleteApiTokenRequestSchema)
  .output(ZDeleteApiTokenResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { id, teamId } = input;

    ctx.logger.info({
      input: {
        id,
        teamId,
      },
    });

    await deleteTokenById({
      id,
      teamId,
      userId: ctx.user.id,
    });
  });
