# API Token Creation Fix

## Problem

API tokens are NOT automatically created when users are created. In Documenso:

- API tokens belong to **Teams**, not directly to Users
- Structure: `User → Organisation → Team → API Token`
- Tokens must be created explicitly

## Database Check

To verify existing tokens:

```sql
-- Check if user has a team
SELECT u.id, u.email, o.id as org_id, o.type, t.id as team_id, t.name as team_name
FROM "User" u
JOIN "OrganisationMember" om ON u.id = om."userId"
JOIN "Organisation" o ON om."organisationId" = o.id
JOIN "Team" t ON o.id = t."organisationId"
WHERE u.email = 'justx@justx.com.br';

-- Check existing API tokens
SELECT at.id, at.name, at."userId", at."teamId", at.expires, u.email
FROM "ApiToken" at
JOIN "User" u ON at."userId" = u.id
ORDER BY at."createdAt" DESC;
```

## Solution 1: Create Tokens via UI (Fastest for Testing)

1. Login as user at http://localhost:3000
2. Navigate to **Settings → API Tokens**
3. Click **Create Token**
4. Name: "WhatsApp Integration"
5. Expiration: Never
6. Copy the token (shown only once: `api_abc123...`)

## Solution 2: Programmatic Token Creation (Production)

Update your `DocumensoService` class:

```typescript
// services/documenso-service.ts

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

interface CreateUserWithTokenResult {
  userId: number;
  email: string;
  teamId: number;
  apiToken: string;
}

export class DocumensoService {
  private readonly baseUrl = process.env.DOCUMENSO_BASE_URL || 'http://localhost:3000';

  /**
   * IMPORTANT: This requires direct database access to Documenso's database
   * Alternative: Use Documenso's admin API if available
   */
  async createUserWithApiToken(
    phoneNumber: string,
    name: string
  ): Promise<CreateUserWithTokenResult> {
    const email = `${phoneNumber.replace(/\+/g, '')}@whatsapp.justx.com.br`;

    // Step 1: Check if user already exists
    let user = await prisma.user.findUnique({
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
      },
    });

    // Step 2: Create user if doesn't exist
    if (!user) {
      // Note: You'll need to create the user through Documenso's signup flow
      // or use the admin user creation if you implement it
      throw new Error('User creation must be done through Documenso signup flow first');
    }

    // Step 3: Find user's personal team
    const personalOrg = user.organisationMember.find(
      (member) => member.organisation.type === 'PERSONAL'
    )?.organisation;

    if (!personalOrg) {
      throw new Error('User has no personal organisation');
    }

    const team = personalOrg.teams[0]; // Personal org should have one team
    if (!team) {
      throw new Error('User has no team in personal organisation');
    }

    // Step 4: Check if token already exists
    const existingToken = await prisma.apiToken.findFirst({
      where: {
        userId: user.id,
        teamId: team.id,
        name: `WhatsApp-${phoneNumber}`,
      },
    });

    if (existingToken) {
      throw new Error('API token already exists for this user. Use existing token.');
    }

    // Step 5: Generate API token
    const apiToken = `api_${this.generateRandomId(16)}`;
    const hashedToken = this.hashToken(apiToken);

    // Step 6: Store token in database
    await prisma.apiToken.create({
      data: {
        name: `WhatsApp-${phoneNumber}`,
        token: hashedToken,
        userId: user.id,
        teamId: team.id,
        expires: null, // No expiration
      },
    });

    return {
      userId: user.id,
      email: user.email,
      teamId: team.id,
      apiToken, // Return the plain token (only time it's visible)
    };
  }

  /**
   * Alternative: Use Documenso's tRPC API to create tokens
   * This is the RECOMMENDED approach if you can authenticate as the user
   */
  async createApiTokenViaAPI(
    userEmail: string,
    userPassword: string,
    tokenName: string
  ): Promise<string> {
    // Step 1: Login as the user to get session
    const loginResponse = await fetch(`${this.baseUrl}/api/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: userPassword,
      }),
    });

    if (!loginResponse.ok) {
      throw new Error('Failed to login');
    }

    const sessionCookie = loginResponse.headers.get('set-cookie');

    // Step 2: Get user's team ID
    const teamsResponse = await fetch(`${this.baseUrl}/api/trpc/team.getTeams`, {
      headers: {
        Cookie: sessionCookie || '',
      },
    });

    const teamsData = await teamsResponse.json();
    const personalTeam = teamsData.result.data.teams.find((t: any) =>
      t.organisation.type === 'PERSONAL'
    );

    if (!personalTeam) {
      throw new Error('No personal team found');
    }

    // Step 3: Create API token via tRPC
    const createTokenResponse = await fetch(
      `${this.baseUrl}/api/trpc/apiToken.create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie || '',
        },
        body: JSON.stringify({
          tokenName,
          teamId: personalTeam.id,
          expirationDate: null,
        }),
      }
    );

    if (!createTokenResponse.ok) {
      throw new Error('Failed to create API token');
    }

    const tokenData = await createTokenResponse.json();
    return tokenData.result.data.token;
  }

  private generateRandomId(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha512').update(token).digest('hex');
  }
}
```

## Solution 3: Extend Admin Initialization (Recommended)

Add API token creation to the admin user initialization:

```typescript
// packages/lib/server-only/admin/admin-user-initializer.ts

import { prisma } from '@documenso/prisma';
import { createApiToken } from '../public-api/create-api-token';

export class AdminUserInitializer {
  static async start(): Promise<void> {
    try {
      await initializeAdminUser();
      await initializeAdminApiToken(); // Add this
    } catch (error) {
      console.error('[AdminUserInitializer] Error:', error);
    }
  }
}

async function initializeAdminApiToken(): Promise<void> {
  const adminEmail = ADMIN_USER_EMAIL();

  if (!adminEmail) {
    return;
  }

  const adminUser = await prisma.user.findUnique({
    where: { email: adminEmail.toLowerCase() },
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

  if (!adminUser) {
    console.log('[AdminUserInitializer] Admin user not found');
    return;
  }

  // Find personal organisation and team
  const personalOrg = adminUser.organisationMember.find(
    (member) => member.organisation.type === 'PERSONAL'
  )?.organisation;

  if (!personalOrg || personalOrg.teams.length === 0) {
    console.log('[AdminUserInitializer] No personal team found for admin');
    return;
  }

  const team = personalOrg.teams[0];

  // Check if token already exists
  const existingToken = await prisma.apiToken.findFirst({
    where: {
      userId: adminUser.id,
      teamId: team.id,
      name: 'Admin Auto-Generated Token',
    },
  });

  if (existingToken) {
    console.log('[AdminUserInitializer] Admin API token already exists');
    return;
  }

  // Create token
  const result = await createApiToken({
    userId: adminUser.id,
    teamId: team.id,
    tokenName: 'Admin Auto-Generated Token',
    expiresIn: null,
  });

  console.log('[AdminUserInitializer] Created admin API token:', result.token);
  console.log('⚠️  SAVE THIS TOKEN - It will not be shown again!');
}
```

## Solution 4: Database Script (Quick Fix for Existing Users)

Create a script to generate tokens for existing users:

```typescript
// scripts/create-user-tokens.ts

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'api_';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function hashToken(token: string): string {
  return crypto.createHash('sha512').update(token).digest('hex');
}

async function createTokensForAllUsers() {
  const users = await prisma.user.findMany({
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

  console.log(`Found ${users.length} users`);

  for (const user of users) {
    // Find personal team
    const personalOrg = user.organisationMember.find(
      (member) => member.organisation.type === 'PERSONAL'
    )?.organisation;

    if (!personalOrg || personalOrg.teams.length === 0) {
      console.log(`⚠️  User ${user.email} has no personal team, skipping`);
      continue;
    }

    const team = personalOrg.teams[0];

    // Check if token exists
    const existingToken = user.apiTokens.find((token) => token.teamId === team.id);

    if (existingToken) {
      console.log(`✓ User ${user.email} already has a token`);
      continue;
    }

    // Create token
    const apiToken = generateToken();
    const hashedToken = hashToken(apiToken);

    await prisma.apiToken.create({
      data: {
        name: 'Auto-Generated Token',
        token: hashedToken,
        userId: user.id,
        teamId: team.id,
        expires: null,
      },
    });

    console.log(`✓ Created token for ${user.email}: ${apiToken}`);
    console.log(`  ⚠️  SAVE THIS TOKEN - It will not be shown again!`);
  }

  await prisma.$disconnect();
}

createTokensForAllUsers().catch(console.error);
```

Run it:
```bash
npx tsx scripts/create-user-tokens.ts
```

## Recommended Approach for WhatsApp Integration

**For your use case, I recommend:**

1. **Manual token creation via UI** (for testing now)
   - Login as each user
   - Create token manually
   - Store in your database

2. **Extend admin initialization** (for production)
   - Modify `admin-user-initializer.ts` to also create a token
   - Token printed to console on first run
   - Admin can use this token to create envelopes programmatically

3. **User self-service** (future enhancement)
   - Users login to Documenso once
   - They create their own API token
   - They paste it into your WhatsApp bot
   - Your system stores and uses their token

## Updated Integration Architecture

Since users need to have Documenso accounts AND tokens manually created, your flow should be:

```
1. User sends WhatsApp message
   ↓
2. Check if user exists in YOUR database with stored API token
   ↓
3a. If YES: Use their token to create envelope
3b. If NO:
    - Tell user to register at http://your-documenso.com
    - Guide them to create API token
    - Ask them to send token back via WhatsApp
    - Store token in your database
   ↓
4. Use stored token for all future documents
   ↓
5. Global webhook notifies you of events
   ↓
6. Send updates back to WhatsApp user
```

## Quick Test Command

To create a token for the admin user right now:

```bash
# Login to Documenso as justx@justx.com.br
# Go to Settings → API Tokens → Create Token
# Copy the token that starts with "api_"

# Then test it:
curl -X GET http://localhost:3000/api/v1/documents \
  -H "Authorization: Bearer api_YOUR_TOKEN_HERE"
```

This should return your documents or an empty array (not an auth error).
