/**
 * Internal API: set password for a Documenso user (JustX provisioning).
 * POST { user_id, password } — same auth as create-user.
 */
import { Hono } from 'hono';

import { setUserPasswordFromJustXProvisioning } from '@documenso/lib/server-only/admin/set-user-password-from-justx-provisioning';
import { env } from '@documenso/lib/utils/env';

import type { HonoEnv } from '../../router';

const SECRET = env('NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET');

export const justxUpdatePasswordRoute = new Hono<HonoEnv>().post('/update-password', async (c) => {
  const authHeader = c.req.header('Authorization');
  const secretFromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : c.req.header('x-justx-provisioning-secret');

  const log = c.get('logger')?.child({ route: 'justx/update-password' }) ?? {
    info: console.log,
    warn: console.warn,
  };

  if (!SECRET || secretFromHeader !== SECRET) {
    log.warn({ msg: 'JustX update-password 401 Unauthorized' });
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: { user_id?: number; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body. Expected { user_id, password }' }, 400);
  }

  const { user_id, password } = body;
  if (user_id == null || typeof password !== 'string' || !password) {
    return c.json({ error: 'Missing required fields: user_id (number), password (string)' }, 400);
  }

  const uid = Number(user_id);
  if (!Number.isInteger(uid) || uid < 1) {
    return c.json({ error: 'user_id must be a positive integer' }, 400);
  }

  try {
    await setUserPasswordFromJustXProvisioning({ userId: uid, password });
    log.info({ msg: 'JustX update-password 200', user_id: uid });
    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.warn({ msg: 'JustX update-password failed', details: message, user_id: uid });

    const response: { error: string; details?: string } = {
      error: 'Failed to update password',
    };

    if (message === 'User not found') {
      return c.json({ error: 'User not found' }, 404);
    }

    if (message === 'User is disabled') {
      return c.json({ error: 'User is disabled' }, 422);
    }

    if (process.env.NODE_ENV === 'development') {
      response.details = message;
    }

    return c.json(response, 500);
  }
});
