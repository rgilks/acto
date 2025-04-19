'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import AuthButton from '@/components/AuthButton';
import AdventureGame from '@/components/AdventureGame';

const Page = () => {
  const { status } = useSession();

  return (
    <main className="flex min-h-screen flex-col items-center p-3 md:pt-4 md:px-8 bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 text-gray-300">
      <div className="z-10 w-full max-w-7xl">
        <div className="flex flex-wrap justify-end items-center gap-2 mb-3 md:mb-4">
          <div className="flex-shrink-0">
            <AuthButton variant="icon-only" />
          </div>
        </div>

        <div className="text-center py-3 md:py-5 fade-in">
          <h1 className="text-4xl md:text-5xl font-bold text-amber-100/90 mb-4">acto</h1>
          <p className="text-lg mb-3 text-gray-400 max-w-2xl mx-auto">
            An AI-powered interactive storytelling experience.
          </p>
          {status !== 'authenticated' && (
            <p className="text-sm mb-5 text-amber-300/70 max-w-2xl mx-auto italic">
              Waiting list active.
            </p>
          )}
        </div>

        <div className="fade-in w-full" style={{ animationDelay: '0.2s' }}>
          <AdventureGame />
        </div>

        <footer
          className="mt-8 md:mt-16 text-center text-sm text-gray-500 fade-in"
          style={{ animationDelay: '0.3s' }}
        >
          <p>
            Powered by Google AI |{' '}
            <Link href="https://github.com/rgilks/acto" className="underline hover:text-gray-300">
              GitHub
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
};

export default Page;
