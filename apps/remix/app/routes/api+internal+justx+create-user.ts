/**
 * Internal API for JustX backend to provision a Documenso user on web signup.
 * Protected by NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET.
 * POST body: { name, email, password }
 * Returns: { user_id, api_token, team_url }
 */
import { createUserWithToken } from '@documenso/lib/server-only/admin/create-user-with-token';
import { prisma } from '@documenso/prisma';

const SECRET = process.env.NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET;

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const authHeader = request.headers.get('Authorization');
  const secretFromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : request.headers.get('x-justx-provisioning-secret');

  if (!SECRET || secretFromHeader !== SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body. Expected { name, email, password }' },
      { status: 400 },
    );
  }

  const { name, email, password } = body;
  if (!name || !email || !password) {
    return Response.json(
      { error: 'Missing required fields: name, email, password' },
      { status: 400 },
    );
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

    return Response.json({
      user_id: result.userId,
      api_token: result.apiToken,
      team_url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: 'Failed to create user', details: message }, { status: 422 });
  }
}
