import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSession } from 'next-auth/react';
import { getServerSession } from 'next-auth';
import AdminPage from './page';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/authOptions', () => ({
  authOptions: {},
}));

jest.mock('@/lib/db', () => {
  const mockDb = {
    prepare: jest.fn(),
    transaction: jest.fn((callback) => callback()),
  };

  mockDb.prepare.mockImplementation(() => ({
    all: jest.fn().mockReturnValue([{ name: 'users' }, { name: 'logs' }]),
    get: jest.fn().mockReturnValue({ totalRows: 10 }),
    run: jest.fn(),
  }));

  return mockDb;
});

import { getTableNames, getTableData } from './actions';

jest.mock('./actions', () => ({
  getTableNames: jest.fn(),
  getTableData: jest.fn(),
}));

const originalEnv = process.env;

describe('Admin page security integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, ADMIN_EMAILS: 'admin@example.com,another@example.com' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Admin access for unauthorized users', () => {
    it('should prevent non-admin users from accessing data through both client and server', async () => {
      (useSession as jest.Mock).mockReturnValue({
        data: {
          user: {
            name: 'Regular User',
            email: 'user@example.com',
            isAdmin: false,
          },
        },
        status: 'authenticated',
      });

      (getServerSession as jest.Mock).mockResolvedValue({
        user: { name: 'Regular User', email: 'user@example.com' },
      });

      (getTableNames as jest.Mock).mockResolvedValue({ error: 'Unauthorized' });
      (getTableData as jest.Mock).mockResolvedValue({ error: 'Unauthorized' });

      await act(async () => {
        render(<AdminPage />);
      });

      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
      expect(screen.getByText('You do not have admin permissions.')).toBeInTheDocument();

      const tableNamesResult = await getTableNames();
      expect(tableNamesResult).toEqual({ error: 'Unauthorized' });

      const tableDataResult = await getTableData('users');
      expect(tableDataResult).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('Admin access for authorized users', () => {
    it('should allow admin users to access data through both client and server', async () => {
      (useSession as jest.Mock).mockReturnValue({
        data: {
          user: {
            name: 'Admin User',
            email: 'admin@example.com',
            isAdmin: true,
          },
        },
        status: 'authenticated',
      });

      (getServerSession as jest.Mock).mockResolvedValue({
        user: { name: 'Admin User', email: 'admin@example.com' },
      });

      (getTableNames as jest.Mock).mockResolvedValue({ data: ['users', 'logs'] });
      (getTableData as jest.Mock).mockResolvedValue({
        data: {
          data: [{ id: 1, name: 'Test User' }],
          totalRows: 10,
          page: 1,
          limit: 10,
        },
      });

      await act(async () => {
        render(<AdminPage />);
      });

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument();
        expect(screen.getByText('logs')).toBeInTheDocument();
      });

      const result = await getTableNames();
      expect(result).toEqual({ data: ['users', 'logs'] });
    });
  });

  describe('Admin email validation', () => {
    it('should validate against the ADMIN_EMAILS environment variable', async () => {
      const testCases = [
        { email: 'admin@example.com', expected: true },
        { email: 'another@example.com', expected: true },
        { email: 'user@example.com', expected: false },
        { email: 'fake@example.com', expected: false },
      ];

      for (const testCase of testCases) {
        (getServerSession as jest.Mock).mockResolvedValue({
          user: { name: 'Test User', email: testCase.email },
        });

        if (testCase.expected) {
          (getTableNames as jest.Mock).mockResolvedValue({ data: ['users', 'logs'] });
        } else {
          (getTableNames as jest.Mock).mockResolvedValue({ error: 'Unauthorized' });
        }

        const result = await getTableNames();
        if (testCase.expected) {
          expect(result).toEqual({ data: expect.any(Array) });
        } else {
          expect(result).toEqual({ error: 'Unauthorized' });
        }
      }
    });
  });
});
