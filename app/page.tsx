'use client';

import Link from 'next/link';
import AuthButton from '@/components/AuthButton';
import Story from '@/app/components/Story';
import Image from 'next/image';
import { useSession, signIn } from 'next-auth/react';
import React from 'react';

const Page = () => {
  const { data: _session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const isLoadingSession = status === 'loading';

  const handleSignIn = (provider: string) => {
    void signIn(provider, { callbackUrl: '/' });
  };

  const buttonBaseClasses =
    'w-full flex items-center justify-center px-4 py-3 mb-4 text-lg font-medium rounded-md transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1e293b]';
  const googleClasses = 'bg-white text-gray-700 hover:bg-gray-100 focus:ring-blue-500';
  const githubClasses =
    'border border-slate-600 bg-transparent text-slate-300 hover:bg-slate-700/50 hover:border-slate-500 focus:ring-slate-500';
  const discordClasses = 'bg-[#5865F2] text-white hover:bg-[#4a56d1] focus:ring-[#5865F2]';

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 text-gray-300">
      <div className="absolute top-4 right-4 md:top-6 md:right-8 z-20">
        {(isAuthenticated || isLoadingSession) && <AuthButton variant="icon-only" />}
      </div>

      <div className="z-10 w-full max-w-7xl flex flex-col items-center">
        <div className="text-center py-3 md:py-5 fade-in">
          <h1 className="text-4xl md:text-5xl font-bold text-amber-100/90 mb-4">acto</h1>
          <p className="text-lg p-3 text-gray-400 max-w-2xl mx-auto">
            An AI-powered interactive storytelling experience.
          </p>
        </div>

        <div className="w-full flex flex-col items-center flex-grow">
          {isLoadingSession && (
            <div className="flex-grow flex items-center justify-center h-[60vh]">
              <svg
                className="animate-spin h-10 w-10 text-amber-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
          )}

          {isAuthenticated && (
            <>
              <div className="fade-in w-full" style={{ animationDelay: '0.2s' }}>
                <Story />
              </div>
              <footer
                className="m-8 mb-16 md:m-16 text-center text-sm text-gray-500 fade-in w-full"
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
                  <Link
                    href="https://github.com/rgilks/acto"
                    className="underline hover:text-gray-300"
                  >
                    GitHub
                  </Link>
                </p>
                <p className="mt-4 text-center">
                  <a href="https://ko-fi.com/N4N31DPNUS" target="_blank" rel="noopener noreferrer">
                    <Image
                      width={145}
                      height={36}
                      style={{ display: 'block', margin: 'auto' }}
                      src="https://storage.ko-fi.com/cdn/kofi2.png?v=6"
                      alt="Buy Me a Coffee at ko-fi.com"
                    />
                  </a>
                </p>
              </footer>
            </>
          )}

          {!isAuthenticated && !isLoadingSession && (
            <div
              className="flex flex-col items-center justify-center flex-grow text-center p-4 mt-8 md:mt-12 max-w-md w-full fade-in"
              data-testid="auth-section"
            >
              <h2
                className="text-3xl font-bold text-amber-100/90 mb-3 font-serif"
                data-testid="auth-heading"
              >
                Start Your Story
              </h2>
              <p className="text-gray-400 mb-8 text-base" data-testid="auth-waitlist-message">
                Sign in to create your own unique stories. Please note: Access is currently limited,
                and signing up will add you to the waitlist.
              </p>

              <div className="mt-6 w-full">
                <button
                  onClick={() => {
                    handleSignIn('google');
                  }}
                  className={`${buttonBaseClasses} ${googleClasses}`}
                  data-testid="signin-google-button"
                >
                  Sign in with Google
                </button>
                <button
                  onClick={() => {
                    handleSignIn('github');
                  }}
                  className={`${buttonBaseClasses} ${githubClasses}`}
                  data-testid="signin-github-button"
                >
                  Sign in with GitHub
                </button>
                <button
                  onClick={() => {
                    handleSignIn('discord');
                  }}
                  className={`${buttonBaseClasses} ${discordClasses}`}
                  data-testid="signin-discord-button"
                >
                  Sign in with Discord
                </button>
              </div>

              <div
                className="mt-12 text-center text-sm text-gray-500 w-full"
                data-testid="auth-footer"
              >
                <p>
                  Powered by{' '}
                  <a
                    href="https://deepmind.google/technologies/gemini/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-gray-300"
                    data-testid="gemini-link"
                  >
                    Gemini
                  </a>{' '}
                  |{' '}
                  <Link
                    href="https://github.com/rgilks/acto"
                    className="underline hover:text-gray-300"
                    data-testid="github-link"
                  >
                    GitHub
                  </Link>
                </p>
                <p className="mt-4 text-center">
                  <a
                    href="https://ko-fi.com/N4N31DPNUS"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="kofi-link"
                  >
                    <Image
                      width={145}
                      height={36}
                      style={{ display: 'block', margin: 'auto' }}
                      src="https://storage.ko-fi.com/cdn/kofi2.png?v=6"
                      alt="Buy Me a Coffee at ko-fi.com"
                    />
                  </a>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default Page;
