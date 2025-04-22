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
    'w-full flex items-center justify-center px-4 py-3 mb-4 text-lg font-medium rounded-lg transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#121826] transform hover:scale-[1.02]';
  const googleClasses = 'bg-white text-gray-700 hover:bg-gray-100 focus:ring-blue-500';
  const githubClasses =
    'border border-slate-600 bg-transparent text-slate-300 hover:bg-slate-700/50 hover:border-slate-500 focus:ring-slate-500';
  const discordClasses = 'bg-[#5865F2] text-white hover:bg-[#4a56d1] focus:ring-[#5865F2]';

  return (
    <main
      className={`relative flex min-h-screen flex-col items-center text-gray-300 ${
        !isAuthenticated && !isLoadingSession ? 'animate-landing-gradient' : ''
      }`}
    >
      <div className="absolute top-4 right-4 md:top-6 md:right-8 z-20">
        {(isAuthenticated || isLoadingSession) && <AuthButton variant="icon-only" />}
      </div>

      <div className="z-10 w-full max-w-7xl flex flex-col items-center">
        <div className="text-center py-3 md:py-5 fade-in">
          <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 bg-clip-text text-transparent">
            acto
          </h1>
          <p className="text-lg p-3 text-gray-400 max-w-2xl mx-auto">
            An interactive storytelling experience.
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
              className="flex flex-col items-center justify-center flex-grow text-center p-6 md:p-8 mt-10 md:mt-16 max-w-lg w-full fade-in"
              style={{ animationDelay: '0.1s' }}
              data-testid="auth-section"
            >
              <h2
                className="text-4xl md:text-5xl font-bold text-amber-100/90 mb-4 font-serif tracking-tight"
                data-testid="auth-heading"
              >
                Start Your Story
              </h2>
              <p className="text-gray-400 mb-8 text-base" data-testid="auth-waitlist-message">
                Sign in to create your own unique stories. Please note: Access is currently limited,
                and signing up will add you to the waitlist.
              </p>

              <div className="mt-8 w-full">
                <button
                  onClick={() => {
                    handleSignIn('google');
                  }}
                  className={`${buttonBaseClasses} ${googleClasses}`}
                  data-testid="signin-google-button"
                >
                  <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                    <path fill="none" d="M1 1h22v22H1z" />
                  </svg>
                  Sign in with Google
                </button>
                <button
                  onClick={() => {
                    handleSignIn('github');
                  }}
                  className={`${buttonBaseClasses} ${githubClasses}`}
                  data-testid="signin-github-button"
                >
                  <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Sign in with GitHub
                </button>
                <button
                  onClick={() => {
                    handleSignIn('discord');
                  }}
                  className={`${buttonBaseClasses} ${discordClasses}`}
                  data-testid="signin-discord-button"
                >
                  <svg className="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.369a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.078.037c-.21.375-.444.864-.608 1.229a18.29 18.29 0 00-5.484 0 10.02 10.02 0 00-.617-1.229.076.076 0 00-.078-.037 19.736 19.736 0 00-4.885 1.515.069.069 0 00-.032.056c-.008.115-.018.255-.026.415a19.081 19.081 0 005.022 15.18.076.076 0 00.087.015 19.9 19.9 0 003.757-1.386 18.18 18.18 0 002.948 1.386.074.074 0 00.087-.015 19.078 19.078 0 005.022-15.18c-.01-.16-.02-.3-.028-.415a.07.07 0 00-.032-.056zM8.03 15.912c-1.104 0-2-.896-2-2s.896-2 2-2 2 .896 2 2-.896 2-2 2zm7.94 0c-1.104 0-2-.896-2-2s.896-2 2-2 2 .896 2 2-.896 2-2 2z" />
                  </svg>
                  Sign in with Discord
                </button>
              </div>

              <div
                className="mt-16 text-center text-sm text-gray-500 w-full"
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
