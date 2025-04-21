'use client';

import { useSession } from 'next-auth/react';
import { Session } from 'next-auth';
import { useState, useEffect } from 'react';
import UserMenuButton from './UserMenuButton';
import SignInOptions from './SignInOptions';

interface AuthButtonProps {
  variant?: 'full' | 'icon-only' | 'short';
}

const AuthButton = ({ variant = 'full' }: AuthButtonProps) => {
  const { data: session, status } = useSession() as {
    data: Session | null;
    status: 'loading' | 'authenticated' | 'unauthenticated';
  };
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || status === 'loading') {
    return <div className="animate-pulse bg-gray-700 h-10 w-32 rounded-lg"></div>;
  }

  if (session) {
    return <UserMenuButton session={session} variant={variant} />;
  }

  return <SignInOptions variant={variant} />;
};

export default AuthButton;
