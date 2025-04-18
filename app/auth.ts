import { getServerSession } from 'next-auth';

export const getSession = async () => {
  const session = await getServerSession();
  return session;
};

export { useSession, signIn, signOut } from 'next-auth/react';
