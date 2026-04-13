/**
 * Internal API for JustX backend to soft-delete (disable) a Documenso user.
 * Protected by NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET (same secret as create-user).
 * POST body: { user_id: number } or { email: string }
 * Returns: { success: true, disabled: true }
 */
import { Hono } from 'hono';

import { disableUser } from '@documenso/lib/server-only/user/disable-user';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';

import type { HonoEnv } from '../../router';

const SECRET = env('NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET');

export const justxDeleteUserRoute = new Hono<HonoEnv>().post('/delete-user', async (c) => {
  const authHeader = c.req.header('Authorization');
  const secretFromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : c.req.header('x-justx-provisioning-secret');

  const log = c.get('logger')?.child({ route: 'justx/delete-user' }) ?? {
    info: console.log,
    warn: console.warn,
  };

  if (!SECRET || secretFromHeader !== SECRET) {
    log.warn({ msg: 'JustX delete-user 401 Unauthorized' });
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: { user_id?: number; email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body. Expected { user_id } or { email }' }, 400);
  }

  const { user_id, email } = body;
  if (!user_id && !email) {
    return c.json({ error: 'Missing required field: user_id or email' }, 400);
  }

  try {
    let resolvedUserId = user_id;

    if (!resolvedUserId && email) {
      const user = await prisma.user.findUnique({
        where: { email: String(email).trim().toLowerCase() },
        select: { id: true, disabled: true },
      });

      if (!user) {
        log.info({ msg: 'JustX delete-user: user not found', email });
        return c.json({
          success: true,
          disabled: true,
          note: 'user not found — already deleted or never existed',
        });
      }

      if (user.disabled) {
        log.info({ msg: 'JustX delete-user: already disabled', email });
        return c.json({ success: true, disabled: true, note: 'already disabled' });
      }

      resolvedUserId = user.id;
    }

    if (!resolvedUserId) {
      return c.json({ error: 'Could not resolve user' }, 400);
    }

    const existing = await prisma.user.findUnique({
      where: { id: resolvedUserId },
      select: { id: true, disabled: true },
    });

    if (!existing) {
      log.info({ msg: 'JustX delete-user: user_id not found', user_id: resolvedUserId });
      return c.json({
        success: true,
        disabled: true,
        note: 'user not found — already deleted or never existed',
      });
    }

    if (existing.disabled) {
      log.info({ msg: 'JustX delete-user: already disabled', user_id: resolvedUserId });
      return c.json({ success: true, disabled: true, note: 'already disabled' });
    }

    await disableUser({ id: resolvedUserId });

    log.info({ msg: 'JustX delete-user 200', user_id: resolvedUserId });
    return c.json({ success: true, disabled: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.warn({ msg: 'JustX delete-user failed', details: message });

    const response: { error: string; details?: string } = {
      error: 'Failed to disable user',
    };

    if (process.env.NODE_ENV === 'development') {
      response.details = message;
    }

    return c.json(response, 500);
  }
});
