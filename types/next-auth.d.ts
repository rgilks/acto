// types/next-auth.d.ts
import 'next-auth';
import { JWT } from 'next-auth/jwt';
import NextAuth, { DefaultSession, DefaultUser } from 'next-auth';
import { JWT as DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    dbId?: number;
    isAdmin?: boolean;
  }

  interface Session {
    user: {
      id?: string | null;
      dbId?: number | null;
      isAdmin?: boolean | null;
      provider?: string | null;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    // Add custom properties to the User object if needed from provider profile
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    dbId?: number | null;
    isAdmin?: boolean | null;
    provider?: string | null;
  }
}
