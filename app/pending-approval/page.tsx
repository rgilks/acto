'use client';

import Link from 'next/link';

const PendingApprovalPage = () => {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-3 md:pt-4 md:px-8 bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 text-gray-300">
      <div className="z-10 w-full max-w-md text-center bg-slate-800/95 border border-slate-700 text-gray-300 p-8 rounded-lg shadow-xl backdrop-blur-sm fade-in">
        <h1 className="text-3xl md:text-4xl font-bold text-amber-100/90 mb-6">
          You&apos;re on the List!
        </h1>
        <p className="text-lg mb-4 text-gray-400">
          Thanks for signing up! You&apos;ve been added to the waiting list.
        </p>
        <p className="text-lg mb-8 text-gray-400">
          We&apos;re gradually granting access to new users. You&apos;ll be able to log in once your
          spot comes up!
        </p>
        <p className="text-sm text-gray-500">
          You can close this page. We may notify you when access is granted, or you can try logging
          in again later.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-block px-6 py-2 rounded bg-amber-600/80 text-white hover:bg-amber-500/80 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-opacity-50 transition-colors"
          >
            Back to Homepage
          </Link>
        </div>
      </div>
    </main>
  );
};

export default PendingApprovalPage;
