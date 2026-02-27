/**
 * Internal API for JustX backend to provision a Documenso user on web signup.
 * Protected by NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET.
 * POST body: { name, email, password }
 * Returns: { user_id, api_token, team_url }
 */
import { Hono } from 'hono';

import { createUserWithToken } from '@documenso/lib/server-only/admin/create-user-with-token';
import { prisma } from '@documenso/prisma';

import type { HonoEnv } from '../../router';

const SECRET = process.env.NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET;

export const justxCreateUserRoute = new Hono<HonoEnv>().post('/create-user', async (c) => {
  const authHeader = c.req.header('Authorization');
  const secretFromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : c.req.header('x-justx-provisioning-secret');

  if (!SECRET || secretFromHeader !== SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: { name?: string; email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body. Expected { name, email, password }' }, 400);
  }

  const { name, email, password } = body;
  if (!name || !email || !password) {
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

    return c.json({
      user_id: result.userId,
      api_token: result.apiToken,
      team_url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: 'Failed to create user', details: message }, 422);
  }
});
