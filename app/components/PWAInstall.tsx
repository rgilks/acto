'use client';

import { useEffect, useState } from 'react';

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
    <div className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white p-4 rounded-lg shadow-lg">
      <p className="mb-2">Add this app to your home screen?</p>
      <button
        onClick={() => {
          void handleInstallClick();
        }}
        className="bg-white text-blue-600 px-4 py-2 rounded font-medium hover:bg-blue-50"
      >
        Install
      </button>
    </div>
  );
};

export default PWAInstall;
