'use client';

import dynamic from 'next/dynamic';

const PWAInstall = dynamic(() => import('./PWAInstall'), {
  ssr: false,
});

const ClientPWAWrapper = () => {
  return <PWAInstall />;
};

export default ClientPWAWrapper;
