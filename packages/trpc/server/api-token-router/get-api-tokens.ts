import { getApiTokens } from '@documenso/lib/server-only/public-api/get-api-tokens';

import { adminProcedure } from '../trpc';
import { ZGetApiTokensRequestSchema, ZGetApiTokensResponseSchema } from './get-api-tokens.types';

export const getApiTokensRoute = adminProcedure
  .input(ZGetApiTokensRequestSchema)
  .output(ZGetApiTokensResponseSchema)
  .query(async ({ ctx }) => {
    const { teamId } = ctx;

    ctx.logger.info({
      input: {
        teamId,
      },
    });

    return await getApiTokens({ userId: ctx.user.id, teamId });
  });
