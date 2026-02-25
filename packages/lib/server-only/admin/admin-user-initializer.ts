import { Role } from '@prisma/client';

import { prisma } from '@documenso/prisma';

import { ADMIN_USER_EMAIL, ADMIN_USER_NAME, ADMIN_USER_PASSWORD } from '../../constants/app';
import { hashSync } from '../auth/hash';
import { onCreateUserHook } from '../user/create-user';

/**
 * Initializes or updates the admin user from environment variables on application startup.
 *
 * Environment variables:
 * - ADMIN_USER_EMAIL: The admin user's email address (required)
 * - ADMIN_USER_PASSWORD: The admin user's password (required)
 * - ADMIN_USER_NAME: The admin user's display name (optional, defaults to "Admin")
 */
export const initializeAdminUser = async (): Promise<void> => {
  const adminEmail = ADMIN_USER_EMAIL();
  const adminPassword = ADMIN_USER_PASSWORD();
  const adminName = ADMIN_USER_NAME();

  // Skip initialization if no admin email/password is configured
  if (!adminEmail || !adminPassword) {
    console.log(
      '[AdminUserInitializer] No admin user environment variables configured, skipping initialization.',
    );
    return;
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: adminEmail.toLowerCase() },
    });

    if (existingUser) {
      // Update existing user to ensure they have admin role and current password
      const hashedPassword = hashSync(adminPassword);
      const hasAdminRole = existingUser.roles.includes(Role.ADMIN);

      if (!hasAdminRole || existingUser.password !== hashedPassword) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            password: hashedPassword,
            name: adminName,
            roles: hasAdminRole ? existingUser.roles : [...existingUser.roles, Role.ADMIN],
          },
        });
        console.log(`[AdminUserInitializer] Updated admin user: ${adminEmail}`);
      } else {
        console.log(`[AdminUserInitializer] Admin user already configured: ${adminEmail}`);
      }

      await onCreateUserHook(existingUser).catch((err) => {
        console.error(
          '[AdminUserInitializer] onCreateUserHook failed for existing admin user:',
          err,
        );
      });
    } else {
      // Create new admin user
      const hashedPassword = hashSync(adminPassword);

      const user = await prisma.user.create({
        data: {
          name: adminName,
          email: adminEmail.toLowerCase(),
          password: hashedPassword,
          emailVerified: new Date(),
          roles: [Role.USER, Role.ADMIN],
        },
      });

      await onCreateUserHook(user).catch((err) => {
        console.error('[AdminUserInitializer] onCreateUserHook failed for admin user:', err);
      });

      console.log(`[AdminUserInitializer] Created admin user: ${adminEmail}`);
    }
  } catch (error) {
    console.error('[AdminUserInitializer] Failed to initialize admin user:', error);
    // Don't throw - we don't want to prevent the app from starting
  }
};

export const AdminUserInitializer = {
  start: () => void initializeAdminUser(),
};
