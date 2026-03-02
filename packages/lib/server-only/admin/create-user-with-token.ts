/**
 * Helper to create a Documenso user with API token programmatically
 * Used by external services (like WhatsApp bot) to provision users
 */
import { hashSync } from '@node-rs/bcrypt';

import { prisma } from '@documenso/prisma';

import { alphaid } from '../../universal/id';
import { hashString } from '../auth/hash';
import { createPersonalOrganisation } from '../organisation/create-organisation';

interface CreateUserWithTokenParams {
  email: string;
  name: string;
  password: string;
  tokenName?: string;
}

interface CreateUserWithTokenResult {
  userId: number;
  email: string;
  teamId: number;
  apiToken: string; // Plain text token - only returned once!
}

/**
 * Creates a new Documenso user with their personal organisation, team, and API token
 * This bypasses the UI and is intended for programmatic user provisioning
 *
 * @param params - User details and optional token name
 * @returns User ID, team ID, and the plain API token (save this!)
 */
export async function createUserWithToken(
  params: CreateUserWithTokenParams,
): Promise<CreateUserWithTokenResult> {
  const { email, name, password, tokenName = 'Auto-Generated Token' } = params;

  const normalizedEmail = email.toLowerCase();

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      organisationMember: {
        include: {
          organisation: {
            include: {
              teams: true,
            },
          },
        },
      },
      apiTokens: true,
    },
  });

  if (existingUser) {
    // Find personal team
    const personalOrg = existingUser.organisationMember.find(
      (member) => member.organisation.type === 'PERSONAL',
    )?.organisation;

    if (!personalOrg || personalOrg.teams.length === 0) {
      throw new Error('User exists but has no personal team');
    }

    const team = personalOrg.teams[0];

    // Check if token already exists for this team
    const existingToken = existingUser.apiTokens.find((token) => token.teamId === team.id);

    if (existingToken) {
      throw new Error('User provisioning failed. Please contact support.');
    }

    // Create token for existing user
    const apiToken = `api_${alphaid(16)}`;
    const hashedToken = hashString(apiToken);

    await prisma.apiToken.create({
      data: {
        name: tokenName,
        token: hashedToken,
        userId: existingUser.id,
        teamId: team.id,
        expires: null,
      },
    });

    return {
      userId: existingUser.id,
      email: existingUser.email,
      teamId: team.id,
      apiToken,
    };
  }

  // Create new user
  const hashedPassword = hashSync(password);

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      password: hashedPassword,
      emailVerified: new Date(),
      roles: ['USER'],
    },
  });

  // Create personal organisation (includes creating a team)
  await createPersonalOrganisation({
    userId: user.id,
    inheritMembers: true,
  });

  // Fetch the created team
  const userWithTeam = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      organisationMember: {
        include: {
          organisation: {
            include: {
              teams: true,
            },
          },
        },
      },
    },
  });

  if (!userWithTeam) {
    throw new Error('Failed to fetch user after creation');
  }

  const personalOrg = userWithTeam.organisationMember.find(
    (member) => member.organisation.type === 'PERSONAL',
  )?.organisation;

  if (!personalOrg || personalOrg.teams.length === 0) {
    throw new Error('Failed to create personal team for user');
  }

  const team = personalOrg.teams[0];

  // Create API token
  const apiToken = `api_${alphaid(16)}`;
  const hashedToken = hashString(apiToken);

  await prisma.apiToken.create({
    data: {
      name: tokenName,
      token: hashedToken,
      userId: user.id,
      teamId: team.id,
      expires: null,
    },
  });

  console.log(`[CreateUserWithToken] Created user ${email} with API token`);

  return {
    userId: user.id,
    email: user.email,
    teamId: team.id,
    apiToken, // Return plain token - only time it's visible!
  };
}

/**
 * Gets the API token for an existing user
 * Note: This cannot return the plain token, only check if it exists
 *
 * @param email - User email
 * @returns Token info (without the actual token value)
 */
export async function getUserToken(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      organisationMember: {
        include: {
          organisation: {
            include: {
              teams: true,
            },
          },
        },
      },
      apiTokens: {
        select: {
          id: true,
          name: true,
          teamId: true,
          expires: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const personalOrg = user.organisationMember.find(
    (member) => member.organisation.type === 'PERSONAL',
  )?.organisation;

  if (!personalOrg || personalOrg.teams.length === 0) {
    return null;
  }

  const team = personalOrg.teams[0];
  const token = user.apiTokens.find((t) => t.teamId === team.id);

  return token
    ? {
        userId: user.id,
        email: user.email,
        teamId: team.id,
        tokenId: token.id,
        tokenName: token.name,
        tokenExpires: token.expires,
      }
    : null;
}
