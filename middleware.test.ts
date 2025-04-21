import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { GetTokenParams, JWT } from 'next-auth/jwt';
import middleware from './middleware';

vi.mock('next-auth/jwt');

import { getToken } from 'next-auth/jwt';
const mockGetToken = getToken as Mock<(params: GetTokenParams) => Promise<JWT | null>>;

describe('Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetToken.mockResolvedValue(null);

    vi.restoreAllMocks();
  });

  const createMockRequest = (pathname: string): NextRequest => {
    const url = new URL(`http://localhost:3000${pathname}`);
    return new NextRequest(url);
  };

  it('should allow admin user to access admin routes', async () => {
    mockGetToken.mockResolvedValue({ isAdmin: true } as JWT);
    const req = createMockRequest('/admin/dashboard');
    const response = await middleware(req);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get('Location')).toBeNull();
    expect(response.status).toBe(200);
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it('should redirect non-admin user from admin routes', async () => {
    mockGetToken.mockResolvedValue({ isAdmin: false } as JWT);
    const req = createMockRequest('/admin/settings');
    const response = await middleware(req);

    expect(response).toBeInstanceOf(NextResponse);
    expect([307, 308]).toContain(response.status);
    expect(response.headers.get('Location')).toBe('http://localhost:3000/');
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it('should redirect user with no token from admin routes', async () => {
    const req = createMockRequest('/admin/users');
    const response = await middleware(req);

    expect(response).toBeInstanceOf(NextResponse);
    expect([307, 308]).toContain(response.status);
    expect(response.headers.get('Location')).toBe('http://localhost:3000/');
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it('should allow admin user to access non-admin routes', async () => {
    mockGetToken.mockResolvedValue({ isAdmin: true } as JWT);
    const req = createMockRequest('/profile');
    const response = await middleware(req);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get('Location')).toBeNull();
    expect(response.status).toBe(200);
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it('should allow non-admin user to access non-admin routes', async () => {
    mockGetToken.mockResolvedValue({ isAdmin: false } as JWT);
    const req = createMockRequest('/dashboard');
    const response = await middleware(req);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get('Location')).toBeNull();
    expect(response.status).toBe(200);
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it('should allow access to /api/auth routes without token check', async () => {
    const req = createMockRequest('/api/auth/signin');
    const response = await middleware(req);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get('Location')).toBeNull();
    expect(response.status).toBe(200);
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it('should handle errors during token retrieval and return 500', async () => {
    const testError = new Error('Token retrieval failed');
    mockGetToken.mockRejectedValue(testError);
    const req = createMockRequest('/somepath');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await middleware(req);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    consoleErrorSpy.mockRestore();
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it('should handle errors within try block (after token check) and return 500', async () => {
    mockGetToken.mockResolvedValue({ isAdmin: false } as JWT);
    const req = createMockRequest('/somepath');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const nextError = new Error('Forced error after token check');
    const nextSpy = vi.spyOn(NextResponse, 'next').mockImplementation(() => {
      throw nextError;
    });

    const response = await middleware(req);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    consoleErrorSpy.mockRestore();
    nextSpy.mockRestore();
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });
});
