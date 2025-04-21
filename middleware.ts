import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const middleware = async (req: import('next/server').NextRequest) => {
  const token = await getToken({ req });
  const isAdmin = token?.isAdmin === true;
  const pathname = req.nextUrl.pathname;
  const isAdminRoute = pathname.startsWith('/admin');

  try {
    console.log(`[Middleware] Path: ${pathname}`);
    console.log(`[Middleware] isAdmin check result: ${isAdmin}`);

    if (isAdminRoute && !isAdmin) {
      console.log(`[Middleware] Redirecting non-admin from /admin to /`);
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = '/';
      return NextResponse.redirect(redirectUrl);
    }
    console.log(`[Middleware] Allowing access to ${pathname}`);
    return NextResponse.next();
  } catch (error) {
    console.error('[Middleware] Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
};

export default middleware;

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json).*)'],
};
