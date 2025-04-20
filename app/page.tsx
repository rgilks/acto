'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import AuthButton from '@/components/AuthButton';
import AdventureGame from '@/components/AdventureGame';

const Page = () => {
  const { status } = useSession();

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 text-gray-300">
      <div className="absolute top-4 right-4 md:top-6 md:right-8 z-20">
        <AuthButton variant="icon-only" />
      </div>

      <div className="z-10 w-full max-w-7xl flex flex-col">
        <div className="text-center py-3 md:py-5 fade-in">
          <h1 className="text-4xl md:text-5xl font-bold text-amber-100/90 mb-4">acto</h1>
          <p className="text-lg p-3 text-gray-400 max-w-2xl mx-auto">
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
          className="m-8 mb-16 md:m-16 text-center text-sm text-gray-500 fade-in"
          style={{ animationDelay: '0.3s' }}
        >
          <p>
            Powered by{' '}
            <a
              href="https://deepmind.google/technologies/gemini/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-300"
            >
              Gemini
            </a>{' '}
            |{' '}
            <Link href="https://github.com/rgilks/acto" className="underline hover:text-gray-300">
              GitHub
            </Link>
          </p>
          <p className="mt-4 text-center">
            <a href="https://ko-fi.com/N4N31DPNUS" target="_blank" rel="noopener noreferrer">
              <img
                height={36}
                style={{ border: '0px', height: '36px', display: 'block', margin: 'auto' }}
                src="https://storage.ko-fi.com/cdn/kofi2.png?v=6"
                alt="Buy Me a Coffee at ko-fi.com"
              />
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
};

export default Page;
