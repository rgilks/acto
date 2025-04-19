'use client';

import Script from 'next/script';

const KofiWidgetScript = () => {
  return (
    <Script
      src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
      strategy="lazyOnload"
      id="kofi-overlay-widget"
      onLoad={() => {
        if (window.kofiWidgetOverlay) {
          window.kofiWidgetOverlay.draw('robgilks', {
            type: 'floating-chat',
            'floating-chat.donateButton.text': 'Tip Me',
            'floating-chat.donateButton.background-color': '#323842',
            'floating-chat.donateButton.text-color': '#fff',
          });
        }
      }}
    />
  );
};

export default KofiWidgetScript;
