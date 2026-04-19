import { prisma } from '@documenso/prisma';

/** Delete all browser sessions for a user (server-side logout everywhere). */
export const revokeAllSessionsForUser = async (userId: number): Promise<void> => {
  await prisma.session.deleteMany({ where: { userId } });
};
