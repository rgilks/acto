import nextPwa from '@ducanh2912/next-pwa';

const withPWA = nextPwa({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [],
  buildExcludes: [/app-build-manifest.json$/],
  publicExcludes: ['!icons/**/*'],
});

/** @type {import('next').NextConfig} */
const nextConfig = withPWA({
  output: 'standalone',
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  distDir: process.env.NEXT_PREVIEW_BUILD === 'true' ? '.next-validation' : '.next',
  async headers() {
    return [
      {
        // Apply these headers to all routes in your application.
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Add a basic Content-Security-Policy (CSP) - may need refinement!
          // {
          //   key: 'Content-Security-Policy',
          //   value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*; font-src 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; base-uri 'self'; connect-src 'self' https://*.google.com https://*.googleapis.com *.sentry.io;",
          // },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/:lang/icons/:path*',
        destination: '/icons/:path*',
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'github.com',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'storage.ko-fi.com',
        pathname: '**',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
    dirs: ['.', 'app', 'components', 'lib'],
  },
});

export default nextConfig;
