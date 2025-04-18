// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://031c80737e74721d1044ac76d03a0d73@o4509095721566208.ingest.us.sentry.io/4509095722156032',

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});

// Add this export for navigation instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
