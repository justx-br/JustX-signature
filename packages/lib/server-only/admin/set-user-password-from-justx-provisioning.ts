import { hash } from '@node-rs/bcrypt';
import type { Prisma } from '@prisma/client';
import { UserSecurityAuditLogType } from '@prisma/client';

import { SALT_ROUNDS } from '@documenso/lib/constants/auth';
import { prisma } from '@documenso/prisma';

export type SetUserPasswordFromJustXProvisioningOptions = {
  userId: number;
  password: string;
};

export const setUserPasswordFromJustXProvisioning = async ({
  userId,
  password,
}: SetUserPasswordFromJustXProvisioningOptions) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, disabled: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.disabled) {
    throw new Error('User is disabled');
  }

  const hashedPassword = await hash(password, SALT_ROUNDS);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.userSecurityAuditLog.create({
      data: {
        userId,
        type: UserSecurityAuditLogType.PASSWORD_UPDATE,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  });
};
