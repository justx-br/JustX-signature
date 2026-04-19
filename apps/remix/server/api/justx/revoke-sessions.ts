/**
 * Internal API: revoke all Documenso sessions for a user (JustX logout / ops).
 * POST { user_id } — same auth as create-user.
 */
import { Hono } from 'hono';

import { revokeAllSessionsForUser } from '@documenso/lib/server-only/user/revoke-all-sessions-for-user';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';

import type { HonoEnv } from '../../router';

const SECRET = env('NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET');

export const justxRevokeSessionsRoute = new Hono<HonoEnv>().post('/revoke-sessions', async (c) => {
  const authHeader = c.req.header('Authorization');
  const secretFromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : c.req.header('x-justx-provisioning-secret');

  const log = c.get('logger')?.child({ route: 'justx/revoke-sessions' }) ?? {
    info: console.log,
    warn: console.warn,
  };

  if (!SECRET || secretFromHeader !== SECRET) {
    log.warn({ msg: 'JustX revoke-sessions 401 Unauthorized' });
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: { user_id?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body. Expected { user_id }' }, 400);
  }

  const { user_id } = body;
  if (user_id == null) {
    return c.json({ error: 'Missing required field: user_id' }, 400);
  }

  const uid = Number(user_id);
  if (!Number.isInteger(uid) || uid < 1) {
    return c.json({ error: 'user_id must be a positive integer' }, 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { id: true },
  });

  if (!user) {
    return c.json({ success: true, note: 'user not found' });
  }

  await revokeAllSessionsForUser(uid);
  log.info({ msg: 'JustX revoke-sessions 200', user_id: uid });
  return c.json({ success: true });
});
