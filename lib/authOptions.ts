import { User, Account } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Discord from 'next-auth/providers/discord';
import { JWT } from 'next-auth/jwt';
import { Session } from 'next-auth';
import db from './db';
import { AdapterUser } from 'next-auth/adapters';
import { z } from 'zod';
import type { NextAuthOptions } from 'next-auth';

export const authEnvSchema = z
  .object({
    GITHUB_ID: z.string().optional(),
    GITHUB_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    AUTH_SECRET: z.string({ required_error: '[NextAuth] ERROR: AUTH_SECRET is missing!' }),
    NEXTAUTH_URL: z.string().url().optional(),
    ADMIN_EMAILS: z.string().optional(),
    ALLOWED_EMAILS: z.string().optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.GITHUB_ID && !data.GITHUB_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GITHUB_SECRET is required when GITHUB_ID is set',
        path: ['GITHUB_SECRET'],
      });
    }
    if (!data.GITHUB_ID && data.GITHUB_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GITHUB_ID is required when GITHUB_SECRET is set',
        path: ['GITHUB_ID'],
      });
    }
    if (data.GOOGLE_CLIENT_ID && !data.GOOGLE_CLIENT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GOOGLE_CLIENT_SECRET is required when GOOGLE_CLIENT_ID is set',
        path: ['GOOGLE_CLIENT_SECRET'],
      });
    }
    if (!data.GOOGLE_CLIENT_ID && data.GOOGLE_CLIENT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GOOGLE_CLIENT_ID is required when GOOGLE_CLIENT_SECRET is set',
        path: ['GOOGLE_CLIENT_ID'],
      });
    }
    if (data.DISCORD_CLIENT_ID && !data.DISCORD_CLIENT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DISCORD_CLIENT_SECRET is required when DISCORD_CLIENT_ID is set',
        path: ['DISCORD_CLIENT_SECRET'],
      });
    }
    if (!data.DISCORD_CLIENT_ID && data.DISCORD_CLIENT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DISCORD_CLIENT_ID is required when DISCORD_CLIENT_SECRET is set',
        path: ['DISCORD_CLIENT_ID'],
      });
    }
    if (!data.NEXTAUTH_URL && data.NODE_ENV === 'production') {
      console.warn('[NextAuth] NEXTAUTH_URL is not set, this might cause issues in production');
    }
  });

const authEnvVars = authEnvSchema.safeParse(process.env);

if (!authEnvVars.success) {
  console.error(
    '❌ Invalid Auth environment variables:',
    JSON.stringify(authEnvVars.error.format(), null, 4)
  );
  throw new Error('Invalid Authentication environment variables. See logs.');
}

const validatedAuthEnv = authEnvVars.data;

interface UserWithEmail extends User {
  email?: string | null;
}

const providers = [];

if (validatedAuthEnv.GITHUB_ID && validatedAuthEnv.GITHUB_SECRET) {
  console.log('[NextAuth] GitHub OAuth credentials found, adding provider');
  providers.push(
    GitHub({
      clientId: validatedAuthEnv.GITHUB_ID,
      clientSecret: validatedAuthEnv.GITHUB_SECRET,
    })
  );
} else if (!validatedAuthEnv.GITHUB_ID && !validatedAuthEnv.GITHUB_SECRET) {
  console.warn('[NextAuth] GitHub OAuth credentials missing (GITHUB_ID and GITHUB_SECRET)');
}

if (validatedAuthEnv.GOOGLE_CLIENT_ID && validatedAuthEnv.GOOGLE_CLIENT_SECRET) {
  console.log('[NextAuth] Google OAuth credentials found, adding provider');
  providers.push(
    Google({
      clientId: validatedAuthEnv.GOOGLE_CLIENT_ID,
      clientSecret: validatedAuthEnv.GOOGLE_CLIENT_SECRET,
    })
  );
} else if (!validatedAuthEnv.GOOGLE_CLIENT_ID && !validatedAuthEnv.GOOGLE_CLIENT_SECRET) {
  console.warn(
    '[NextAuth] Google OAuth credentials missing (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)'
  );
}

if (validatedAuthEnv.DISCORD_CLIENT_ID && validatedAuthEnv.DISCORD_CLIENT_SECRET) {
  console.log('[NextAuth] Discord OAuth credentials found, adding provider');
  providers.push(
    Discord({
      clientId: validatedAuthEnv.DISCORD_CLIENT_ID,
      clientSecret: validatedAuthEnv.DISCORD_CLIENT_SECRET,
    })
  );
} else if (!validatedAuthEnv.DISCORD_CLIENT_ID && !validatedAuthEnv.DISCORD_CLIENT_SECRET) {
  console.warn(
    '[NextAuth] Discord OAuth credentials missing (DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET)'
  );
}

console.log(`[NextAuth] Configured ${providers.length} authentication providers`);

export const authOptions: NextAuthOptions = {
  providers,
  secret: validatedAuthEnv.AUTH_SECRET,
  debug: (validatedAuthEnv.NODE_ENV || process.env.NODE_ENV) !== 'production',
  session: {
    strategy: 'jwt' as const,
  },
  pages: {},
  callbacks: {
    signIn: ({ user, account }: { user: User | AdapterUser; account: Account | null }) => {
      // --- Store/Update user data in DB ---
      try {
        db.prepare(
          `
            INSERT INTO users (provider_id, provider, name, email, image, last_login, language)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(provider_id, provider)
            DO UPDATE SET name = ?, email = ?, image = ?, last_login = CURRENT_TIMESTAMP
          `
        ).run(
          user.id,
          account?.provider,
          user.name || null,
          user.email || null,
          user.image || null,
          'en',
          user.name || null,
          user.email || null,
          user.image || null
        );
      } catch (error) {
        console.error('[AUTH] Error storing user data:', error);
        // Optionally, decide if the sign-in should fail if the DB operation fails
        // return false;
      }
      // --- End Store/Update user data in DB ---

      // --- Waiting List / Admin Check ---
      const rawAllowedEmails = validatedAuthEnv.ALLOWED_EMAILS;
      const rawAdminEmails = validatedAuthEnv.ADMIN_EMAILS;
      const waitingListEnabled =
        typeof rawAllowedEmails === 'string' && rawAllowedEmails.length > 0;
      const adminListExists = typeof rawAdminEmails === 'string' && rawAdminEmails.length > 0;

      // Combine allowed and admin emails into a single set for checking
      const combinedAllowedEmails = new Set<string>();
      if (waitingListEnabled) {
        rawAllowedEmails
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
          .forEach((email) => combinedAllowedEmails.add(email));
      }
      if (adminListExists) {
        rawAdminEmails
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
          .forEach((email) => combinedAllowedEmails.add(email));
      }

      // Only enforce the check if waiting list is enabled or admin list exists
      if (waitingListEnabled || adminListExists) {
        const userEmail = user.email?.toLowerCase();
        if (!userEmail || !combinedAllowedEmails.has(userEmail)) {
          console.warn(
            `[AUTH SignIn] Denied access for email: ${user.email || 'N/A'} (not in ALLOWED_EMAILS or ADMIN_EMAILS) - Redirecting to pending.`
          );
          return '/pending-approval'; // Redirect to pending page instead of returning false
        }
        console.log(
          `[AUTH SignIn] Allowed access for email: ${user.email} (found in ALLOWED_EMAILS or ADMIN_EMAILS)`
        );
      } else {
        // If neither waiting list nor admin list is set, allow everyone
        // console.log('[AUTH SignIn] No ALLOWED_EMAILS or ADMIN_EMAILS set, allowing all users.');
      }
      // --- End Waiting List / Admin Check ---

      // If the code reaches here, the user is either approved or no list check is needed.
      return true;
    },
    jwt: ({
      token,
      user,
      account,
    }: {
      token: JWT;
      user?: UserWithEmail;
      account?: Account | null;
    }) => {
      if (account && user?.id && user.email) {
        token.provider = account.provider;
        token.email = user.email;

        try {
          const userRecord = db
            .prepare('SELECT id FROM users WHERE provider_id = ? AND provider = ?')
            .get(user.id, account.provider);

          if (
            userRecord &&
            typeof userRecord === 'object' &&
            'id' in userRecord &&
            typeof userRecord.id === 'number'
          ) {
            token.dbId = userRecord.id;
          } else {
            console.error(
              `[AUTH JWT Callback] CRITICAL: Could not find user in DB during JWT creation for provider_id=${user.id}, provider=${account.provider}. dbId will be missing!`
            );
          }
        } catch (error) {
          console.error(
            '[AUTH JWT Callback] CRITICAL: DB error fetching user ID for token:',
            error
          );
        }

        const rawAdminEmails = validatedAuthEnv.ADMIN_EMAILS;
        let adminEmails: string[] = [];
        if (typeof rawAdminEmails === 'string' && rawAdminEmails.length > 0) {
          adminEmails = rawAdminEmails
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean);
        }
        token.isAdmin = adminEmails.includes(user.email);
      }

      return token;
    },
    session: ({ session, token }: { session: Session; token: JWT }) => {
      if (token.sub) {
        session.user.id = token.sub;
      }
      if (typeof token.dbId === 'number') {
        session.user.dbId = token.dbId;
      } else {
        console.warn('[AUTH Session Callback] dbId missing from token. Cannot assign to session.');
      }
      if (typeof token.isAdmin === 'boolean') {
        session.user.isAdmin = token.isAdmin;
      }
      if (token.provider) {
        session.user.provider = token.provider;
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name:
        (validatedAuthEnv.NODE_ENV || process.env.NODE_ENV) === 'production'
          ? `__Secure-next-auth.session-token`
          : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: (validatedAuthEnv.NODE_ENV || process.env.NODE_ENV) === 'production',
      },
    },
  },
};
