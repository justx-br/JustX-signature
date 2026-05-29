/**
 * Internal API for JustX backend to generate a short-lived SSO login URL.
 * Protected by NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET.
 * POST body: { documenso_user_id: number, redirect_to?: string }
 * Returns: { login_url: string }
 */
import { Hono } from 'hono';

import { encryptSecondaryData } from '@documenso/lib/server-only/crypto/encrypt';
import { env } from '@documenso/lib/utils/env';

import type { HonoEnv } from '../../router';

const SECRET = env('NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET');
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export const justxGenerateLoginUrlRoute = new Hono<HonoEnv>().post(
  '/generate-login-url',
  async (c) => {
    const authHeader = c.req.header('Authorization');
    const secretFromHeader = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : c.req.header('x-justx-provisioning-secret');

    if (!SECRET || secretFromHeader !== SECRET) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let body: { documenso_user_id?: unknown; redirect_to?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const documensoUserId = Number(body.documenso_user_id);
    if (!Number.isInteger(documensoUserId) || documensoUserId <= 0) {
      return c.json({ error: 'Missing or invalid documenso_user_id' }, 400);
    }

    const redirectTo =
      typeof body.redirect_to === 'string' && body.redirect_to.startsWith('/')
        ? body.redirect_to
        : '/documents';

    try {
      const token = encryptSecondaryData({
        data: JSON.stringify({ userId: documensoUserId }),
        expiresAt: Date.now() + TTL_MS,
      });

      const webappUrl = env('NEXT_PUBLIC_WEBAPP_URL');
      if (!webappUrl) {
        return c.json({ error: 'NEXT_PUBLIC_WEBAPP_URL not configured' }, 500);
      }
      const loginUrl = `${webappUrl.replace(/\/$/, '')}/api/auth/email-password/sso?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirectTo)}`;

      return c.json({ login_url: loginUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ error: 'Failed to generate login URL', details: message }, 500);
    }
  },
);
