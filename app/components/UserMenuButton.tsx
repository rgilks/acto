'use client';

import { signOut } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { Session } from 'next-auth';
import { useState, useEffect, useRef } from 'react';
import useStoryStore from '@/store/storyStore';

interface UserMenuButtonProps {
  session: Session;
  variant?: 'full' | 'icon-only' | 'short'; // Keep variant for potential future use or consistency
}

const UserMenuButton = ({ session, variant = 'full' }: UserMenuButtonProps) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const triggerReset = useStoryStore((state) => state.triggerReset);
  const saveStory = useStoryStore((state) => state.saveStory);
  const storyHistory = useStoryStore((state) => state.storyHistory);
  const currentNode = useStoryStore((state) => state.currentNode);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleNewScenarioClick = async () => {
    const storyExists = storyHistory.length > 0 || !!currentNode;

    if (storyExists) {
      const shouldSave = window.confirm(
        'You have an ongoing story. Do you want to download it before starting a new one? '
      );
      if (shouldSave) {
        try {
          await saveStory();
          console.log('[UserMenuButton] Story saved before reset.');
        } catch (error) {
          console.error('[UserMenuButton] Error saving story before reset:', error);
        }
      }
    }

    triggerReset();
    setShowUserMenu(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 md:gap-4 relative" ref={userMenuRef}>
      <button
        className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:ring-blue-500 rounded-full p-1"
        onClick={() => {
          setShowUserMenu(!showUserMenu);
        }}
      >
        <div className="flex items-center gap-2">
          {session.user.image && (
            <Image
              src={session.user.image}
              alt={session.user.name || 'User'}
              width={32}
              height={32}
              className="rounded-full animate-scale-up"
            />
          )}
          {/* Variant check kept for potential styling consistency, though only name is shown */}
          {variant === 'full' && session.user.name && (
            <span className="text-white">{session.user.name}</span>
          )}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* User Dropdown Menu - Conditionally Rendered */}
      {showUserMenu && (
        <div
          className="absolute right-0 top-full mt-2 w-48 rounded-md shadow-lg z-10 bg-gray-800 border border-gray-700 overflow-hidden animate-scale-up origin-top-right"
          role="menu"
        >
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-sm text-white">{session.user.name}</p>
            <p className="text-xs text-gray-400 truncate">{session.user.email}</p>
          </div>
          <div className="py-1">
            {session.user.isAdmin && (
              <Link
                href="/admin"
                className="block px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors w-full text-left focus:outline-none focus-visible:bg-gray-700 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-600"
                onClick={() => {
                  setShowUserMenu(false);
                }}
              >
                Admin
              </Link>
            )}
            <button
              onClick={handleNewScenarioClick}
              className="block px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors w-full text-left focus:outline-none focus-visible:bg-gray-700 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-600"
            >
              New Scenario
            </button>
            <button
              onClick={async () => {
                setShowUserMenu(false);
                await saveStory();
              }}
              className="block px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors w-full text-left focus:outline-none focus-visible:bg-gray-700 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-600"
            >
              Save Story (Download)
            </button>
            <button
              onClick={async () => {
                setShowUserMenu(false);
                await signOut({ callbackUrl: '/' });
              }}
              className="block px-4 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors w-full text-left focus:outline-none focus-visible:bg-gray-700 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-600"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenuButton;
