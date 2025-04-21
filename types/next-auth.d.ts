// types/next-auth.d.ts
import 'next-auth';
import { DefaultSession } from 'next-auth';

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
}

declare module 'next-auth/jwt' {
  interface JWT {
    dbId?: number | null;
    isAdmin?: boolean | null;
    provider?: string | null;
  }
}
