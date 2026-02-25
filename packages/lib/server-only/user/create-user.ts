import { hash } from '@node-rs/bcrypt';
import { OrganisationType } from '@prisma/client';
import type { Team, User } from '@prisma/client';

import { prisma } from '@documenso/prisma';

import { SALT_ROUNDS } from '../../constants/auth';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { alphaid, prefixedId } from '../../universal/id';
import { hashString } from '../auth/hash';
import { createPersonalOrganisation } from '../organisation/create-organisation';
import { createTeam } from '../team/create-team';

export interface CreateUserOptions {
  name: string;
  email: string;
  password: string;
  signature?: string | null;
}

export const createUser = async ({ name, email, password, signature }: CreateUserOptions) => {
  const hashedPassword = await hash(password, SALT_ROUNDS);

  const userExists = await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
    },
  });

  if (userExists) {
    throw new AppError(AppErrorCode.ALREADY_EXISTS);
  }

  const user = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword, // Todo: (RR7) Drop password.
        signature,
      },
    });

    // Todo: (RR7) Migrate to use this after RR7.
    // await tx.account.create({
    //   data: {
    //     userId: user.id,
    //     type: 'emailPassword', // Todo: (RR7)
    //     provider: 'DOCUMENSO', // Todo: (RR7) Enums
    //     providerAccountId: user.id.toString(),
    //     password: hashedPassword,
    //   },
    // });

    return user;
  });

  await onCreateUserHook(user).catch((err) => {
    console.error(
      '[createUser] onCreateUserHook failed (user created, org/team/token may be missing):',
      err,
    );
  });

  return user;
};

/**
 * Should be run after a user is created, example during email password signup or google sign in.
 * Ensures personal organisation, team, and a default ApiToken exist.
 *
 * @returns User
 */
export const onCreateUserHook = async (user: User) => {
  let personalOrg = await prisma.organisation.findFirst({
    where: {
      ownerUserId: user.id,
      type: OrganisationType.PERSONAL,
    },
    include: { teams: true },
  });

  if (!personalOrg) {
    await createPersonalOrganisation({ userId: user.id });

    personalOrg = await prisma.organisation.findFirst({
      where: {
        ownerUserId: user.id,
        type: OrganisationType.PERSONAL,
      },
      include: { teams: true },
    });
  }

  if (!personalOrg) {
    console.error(
      '[onCreateUserHook] No personal organisation for user id:',
      user.id,
      '- ApiToken not created.',
    );
    return user;
  }

  let team: Team | null = personalOrg.teams[0] ?? null;

  if (!team) {
    try {
      await createTeam({
        userId: user.id,
        teamName: 'Personal Team',
        teamUrl: prefixedId('personal'),
        organisationId: personalOrg.id,
        inheritMembers: true,
      });
    } catch (teamErr) {
      console.error('[onCreateUserHook] createTeam failed for user id:', user.id, teamErr);
      return user;
    }

    team = await prisma.team.findFirst({
      where: { organisationId: personalOrg.id },
    });
  }

  if (team) {
    const existingToken = await prisma.apiToken.findFirst({
      where: { userId: user.id, teamId: team.id },
    });

    if (!existingToken) {
      try {
        const plainToken = `api_${alphaid(16)}`;
        const hashedToken = hashString(plainToken);

        await prisma.apiToken.create({
          data: {
            name: 'Default',
            token: hashedToken,
            userId: user.id,
            teamId: team.id,
            expires: null,
          },
        });
      } catch (tokenErr) {
        console.error('[onCreateUserHook] ApiToken.create failed for user id:', user.id, tokenErr);
      }
    }
  } else {
    console.error('[onCreateUserHook] No team for user id:', user.id, '- ApiToken not created.');
  }

  return user;
};
