import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import AdminPage from './page';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

import { getTableNames, getTableData } from './actions';

vi.mock('./actions', () => ({
  getTableNames: vi.fn(),
  getTableData: vi.fn(),
}));

const mockUseSession = useSession as Mock;
const mockGetTableNames = getTableNames as Mock;
const mockGetTableData = getTableData as Mock;

describe('AdminPage component', () => {
  let tableNamesPromiseResolve: (value: any) => void;
  let tableNamesPromise: Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();

    tableNamesPromise = new Promise((resolve) => {
      tableNamesPromiseResolve = resolve;
    });

    mockGetTableNames.mockImplementation(() => tableNamesPromise);
    mockGetTableData.mockImplementation(() =>
      Promise.resolve({
        data: {
          data: [{ id: 1, name: 'Test User' }],
          totalRows: 10,
          page: 1,
          limit: 10,
        },
      })
    );
  });

  it('should show loading state while checking authentication', async () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'loading',
      update: vi.fn(),
    });

    await act(async () => {
      render(<AdminPage />);
    });

    expect(screen.getByText('Loading authentication status...')).toBeInTheDocument();
  });

  it('should show unauthorized message when user is not logged in', async () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn(),
    });

    await act(async () => {
      render(<AdminPage />);
    });

    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    expect(screen.getByText('You must be logged in to access the admin area.')).toBeInTheDocument();
  });

  it('should show unauthorized message when user is not an admin', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'Regular User',
          email: 'user@example.com',
          isAdmin: false,
        },
        expires: '2100-01-01T00:00:00.000Z',
      },
      status: 'authenticated',
      update: vi.fn(),
    });

    await act(async () => {
      render(<AdminPage />);
    });

    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    expect(screen.getByText('You do not have admin permissions.')).toBeInTheDocument();
  });

  it('should load table names when user is an admin', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'Admin User',
          email: 'admin@example.com',
          isAdmin: true,
        },
        expires: '2100-01-01T00:00:00.000Z',
      },
      status: 'authenticated',
      update: vi.fn(),
    });

    await act(async () => {
      render(<AdminPage />);
    });

    expect(screen.getByText(/Loading table names.../i)).toBeInTheDocument();

    await act(async () => {
      tableNamesPromiseResolve({ data: ['users', 'logs'] });
      await tableNamesPromise;
    });

    await waitFor(() => {
      expect(screen.getByText('users')).toBeInTheDocument();
      expect(screen.getByText('logs')).toBeInTheDocument();
    });

    expect(mockGetTableNames).toHaveBeenCalled();
  });

  it('should handle error when loading table names fails', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'Admin User',
          email: 'admin@example.com',
          isAdmin: true,
        },
        expires: '2100-01-01T00:00:00.000Z',
      },
      status: 'authenticated',
      update: vi.fn(),
    });

    await act(async () => {
      render(<AdminPage />);
    });

    await act(async () => {
      tableNamesPromiseResolve({ error: 'Unauthorized' });
      await tableNamesPromise;
    });

    await waitFor(() => {
      expect(screen.getByText(/Error loading tables: Unauthorized/i)).toBeInTheDocument();
    });
  });
});
