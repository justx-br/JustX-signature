import { getApiTokens } from '@documenso/lib/server-only/public-api/get-api-tokens';

import { adminProcedure } from '../trpc';
import { ZGetApiTokensRequestSchema, ZGetApiTokensResponseSchema } from './get-api-tokens.types';

export const getApiTokensRoute = adminProcedure
  .input(ZGetApiTokensRequestSchema)
  .output(ZGetApiTokensResponseSchema)
  .query(async ({ ctx }) => {
    const { teamId, user } = ctx;

    if (teamId == null || user?.id == null) {
      throw new Error('Unauthorized or missing team context');
    }

    ctx.logger.info({
      input: {
        teamId,
      },
    });

    return await getApiTokens({ userId: user.id, teamId });
  });
