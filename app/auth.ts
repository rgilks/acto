import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export const getSession = async () => {
  const session = await getServerSession(authOptions);
  return session;
};

export { useSession, signIn, signOut } from 'next-auth/react';
