import NextAuth from 'next-auth';
import { authOptions } from '@/lib/authOptions';
// import { NextApiHandler } from 'next'; // Revert this import

// Revert handler definition
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
