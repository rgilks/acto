import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://031c80737e74721d1044ac76d03a0d73@o4509095721566208.ingest.us.sentry.io/4509095722156032',
  tracesSampleRate: 1,
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
