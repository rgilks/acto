'use client';

import { useEffect, useState } from 'react';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

const PWAInstall = () => {
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setShowInstallButton(true);
    });

    window.addEventListener('appinstalled', () => {
      setShowInstallButton(false);
      deferredPrompt = null;
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();

      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA Install] User choice: ${outcome}`);
    } catch (error) {
      console.error('[PWA Install] Error during install prompt:', error);
    } finally {
      deferredPrompt = null;
      setShowInstallButton(false);
    }
  };

  if (!showInstallButton) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-slate-800/95 border border-slate-700 text-gray-300 p-4 rounded-lg shadow-xl max-w-xs backdrop-blur-sm fade-in">
      <button
        onClick={() => setShowInstallButton(false)}
        className="absolute top-2 right-2 p-1 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label="Dismiss install prompt"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
      <p className="text-sm mb-4 pr-4">
        Install Acto on your device for quick access and a better experience.
      </p>
      <div className="flex justify-end">
        <button
          onClick={() => {
            void handleInstallClick();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-br from-amber-600 to-amber-700 text-white text-sm font-medium hover:from-amber-500 hover:to-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-800 transition-all shadow-sm hover:shadow-md"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Install App
        </button>
      </div>
    </div>
  );
};

export default PWAInstall;
