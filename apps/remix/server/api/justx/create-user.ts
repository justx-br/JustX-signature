/**
 * Internal API for JustX backend to provision a Documenso user on web signup.
 * Protected by NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET.
 * POST body: { name, email, password }
 * Returns: { user_id, api_token, team_url }
 *
 * Env is loaded from repo root .env via "with:env" (dotenv -e ../../.env).
 * Ensure NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET is set there (no spaces, exact name).
 */
import { Hono } from 'hono';

import { createUserWithToken } from '@documenso/lib/server-only/admin/create-user-with-token';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';

import type { HonoEnv } from '../../router';

const SECRET = env('NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET');

export const justxCreateUserRoute = new Hono<HonoEnv>().post('/create-user', async (c) => {
  const authHeader = c.req.header('Authorization');
  const secretFromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : c.req.header('x-justx-provisioning-secret');

  const log = c.get('logger')?.child({ route: 'justx/create-user' }) ?? {
    info: console.log,
    warn: console.warn,
  };
  log.info({
    msg: 'JustX provisioning request',
    hasAuthHeader: Boolean(authHeader),
    hasXJustxHeader: Boolean(c.req.header('x-justx-provisioning-secret')),
    hasSecretConfigured: Boolean(SECRET),
  });

  if (!SECRET || secretFromHeader !== SECRET) {
    log.warn({
      msg: 'JustX provisioning 401 Unauthorized',
      reason: !SECRET
        ? 'NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET not set'
        : 'secret mismatch or missing header',
    });
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: { name?: string; email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    log.info({ msg: 'JustX provisioning 400', reason: 'invalid JSON body' });
    return c.json({ error: 'Invalid JSON body. Expected { name, email, password }' }, 400);
  }

  const { name, email, password } = body;
  if (!name || !email || !password) {
    log.info({ msg: 'JustX provisioning 400', reason: 'missing fields' });
    return c.json({ error: 'Missing required fields: name, email, password' }, 400);
  }

  try {
    const result = await createUserWithToken({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      password: String(password),
      tokenName: 'JustX Provisioning',
    });

    const team = await prisma.team.findUnique({
      where: { id: result.teamId },
      select: { url: true },
    });

    const team_url = team?.url ?? '';

    log.info({
      msg: 'JustX provisioning 200',
      email: String(email).trim().toLowerCase(),
      user_id: result.userId,
      has_team_url: Boolean(team_url),
    });

    return c.json({
      user_id: result.userId,
      api_token: result.apiToken,
      team_url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.warn({
      msg: 'JustX provisioning failed',
      email: String(email).trim().toLowerCase(),
      details: message,
      stack: err instanceof Error ? err.stack : undefined,
    });

    // Only expose error details in development mode
    const response: { error: string; details?: string } = {
      error: 'Failed to create user',
    };

    if (process.env.NODE_ENV === 'development') {
      response.details = message;
    }

    return c.json(response, 422);
  }
});
