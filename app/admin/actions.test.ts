import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { getTableNames, getTableData } from './actions';
import db from '@/lib/db'; // This will now be the Drizzle instance
import * as schema from '@/lib/db/schema'; // Import schema for table references
import { getServerSession } from 'next-auth';
import { SQL, desc } from 'drizzle-orm'; // Import SQL and desc for type checking and usage in test

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/authOptions', () => ({
  authOptions: {},
}));

// Mock the Drizzle db instance and its methods
vi.mock('@/lib/db', async (importOriginal) => {
  const actualDb = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actualDb,
    default: {
      // Mock specific Drizzle methods used in actions.ts
      all: vi.fn(),
      get: vi.fn(),
      select: vi.fn().mockReturnThis(), // For fluent API: .select().from()...
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      $dynamic: vi.fn().mockReturnThis(), // Mock $dynamic
      // Mock transaction to just run the callback
      transaction: vi.fn(), // Simpler mock for transaction initially
      // Keep other potential db properties/methods if any, or mock them as needed
      // For instance, if run, prepare, etc. are somehow still accessed directly (they shouldn't be for Drizzle select/insert/update)
    },
  };
});

const mockGetServerSession = getServerSession as Mock;
const dbMock = db as unknown as {
  all: Mock;
  get: Mock;
  select: Mock;
  from: Mock;
  where: Mock;
  orderBy: Mock;
  limit: Mock;
  offset: Mock;
  $dynamic: Mock;
  transaction: Mock<(cb: (tx: any) => any) => any>;
};

const originalEnv = { ...process.env };

describe('Admin actions with Drizzle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, ADMIN_EMAILS: 'admin@example.com' };

    // Configure chainable mocks
    dbMock.select.mockReturnThis();
    dbMock.from.mockReturnThis();
    dbMock.where.mockReturnThis();
    dbMock.orderBy.mockReturnThis();
    dbMock.limit.mockReturnThis();
    dbMock.offset.mockReturnThis();
    dbMock.$dynamic.mockReturnThis();

    // Mock transaction to execute the callback with the dbMock itself as tx context
    // This assumes methods like .select, .get, .all are available on the tx object via dbMock
    dbMock.transaction.mockImplementation((cb: (txDb: typeof dbMock) => any) => cb(dbMock));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Authorization (isAdmin)', () => {
    it('should return unauthorized if user is not logged in', async () => {
      mockGetServerSession.mockResolvedValue(null);
      const result = await getTableNames();
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('should return unauthorized if user has no email', async () => {
      mockGetServerSession.mockResolvedValue({ user: { name: 'Test User' } });
      const result = await getTableNames();
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('should return unauthorized if user email is not in ADMIN_EMAILS', async () => {
      mockGetServerSession.mockResolvedValue({
        user: { name: 'Test User', email: 'user@example.com' },
      });
      const result = await getTableNames();
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('should return unauthorized if ADMIN_EMAILS is empty', async () => {
      process.env.ADMIN_EMAILS = '';
      mockGetServerSession.mockResolvedValue({
        user: { name: 'Admin User', email: 'admin@example.com' },
      });
      const result = await getTableNames();
      expect(result).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('getTableNames function', () => {
    it('should return unauthorized if user is not admin', async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: 'notadmin@example.com' } });
      const result = await getTableNames();
      expect(result).toEqual({ error: 'Unauthorized' });
    });

    it('should return filtered table names if user is admin', async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
      const mockRawTableNames = [
        { name: 'users' },
        { name: 'rate_limits_user' },
        { name: 'some_other_table' },
      ];
      dbMock.all.mockReturnValueOnce(mockRawTableNames);

      const result = await getTableNames();

      expect(result).toEqual({ data: ['users', 'rate_limits_user'] });
      expect(dbMock.all).toHaveBeenCalledTimes(1);
      // Check that it was called with a Drizzle SQL object containing the specific query string
      expect(dbMock.all).toHaveBeenCalledWith(expect.any(SQL));
    });

    it('should handle database error when fetching table names', async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
      const dbError = new Error('DB connection failed');
      dbMock.all.mockImplementationOnce(() => {
        throw dbError;
      });

      const result = await getTableNames();

      expect(result).toEqual({ data: [] });
      expect(dbMock.all).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTableData function', () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
    });

    it('should return unauthorized error if user is not an admin', async () => {
      mockGetServerSession.mockResolvedValue({ user: { email: 'notadmin@example.com' } });
      const result = await getTableData('users');
      expect(result).toEqual({ error: 'Unauthorized' });
      expect(dbMock.transaction).not.toHaveBeenCalled();
    });

    it('should return "Invalid or disallowed table name" error for disallowed table', async () => {
      const result = await getTableData('disallowed_table');
      expect(result).toEqual({ error: 'Invalid or disallowed table name' });
      expect(dbMock.transaction).not.toHaveBeenCalled();
    });

    it('should return data for allowed table "users"', async () => {
      const mockUserData = [{ id: 1, email: 'user1@example.com' }];
      const mockTotalRows = 15;

      // Mock for count: db.select({ totalRows: sql<number>`count(*)` }).from(tableSchema).get();
      // The chain is: dbMock.select().from().get()
      dbMock.from.mockReturnThis(); // Ensure from is chainable before get
      dbMock.get.mockReturnValueOnce({ totalRows: mockTotalRows });

      // Mock for data: selectBuilder.limit(safeLimit).offset(offset).all();
      // The chain from selectBuilder is: dbMock.$dynamic().limit().offset().all()
      dbMock.offset.mockReturnThis(); // Ensure offset is chainable before all
      dbMock.all.mockReturnValueOnce(mockUserData);

      const result = await getTableData('users', 1, 5);

      expect(result).toEqual({
        data: {
          data: mockUserData,
          totalRows: mockTotalRows,
          page: 1,
          limit: 5,
        },
      });
      expect(dbMock.transaction).toHaveBeenCalledTimes(1);
      expect(dbMock.select).toHaveBeenCalledWith({ totalRows: expect.any(SQL) });
      expect(dbMock.from).toHaveBeenCalledWith(schema.users);
      expect(dbMock.get).toHaveBeenCalledTimes(1);

      expect(dbMock.select).toHaveBeenCalledWith(); // For data query
      expect(dbMock.from).toHaveBeenCalledWith(schema.users);
      expect(dbMock.$dynamic).toHaveBeenCalledTimes(1);
      expect(dbMock.orderBy).toHaveBeenCalledWith(desc(schema.users.lastLogin));
      expect(dbMock.limit).toHaveBeenCalledWith(5);
      expect(dbMock.offset).toHaveBeenCalledWith(0);
      expect(dbMock.all).toHaveBeenCalledTimes(1); // This is for the data itself
    });

    it('should return data for allowed table "rate_limits_user"', async () => {
      const mockRateLimitData = [{ userId: 1, apiType: 'text' }];
      const mockTotalRows = 8;

      dbMock.from.mockReturnThis();
      dbMock.get.mockReturnValueOnce({ totalRows: mockTotalRows });

      dbMock.offset.mockReturnThis();
      dbMock.all.mockReturnValueOnce(mockRateLimitData);

      const result = await getTableData('rate_limits_user', 2, 10);

      expect(result).toEqual({
        data: {
          data: mockRateLimitData,
          totalRows: mockTotalRows,
          page: 2,
          limit: 10,
        },
      });
      expect(dbMock.transaction).toHaveBeenCalledTimes(1);
      expect(dbMock.select).toHaveBeenCalledWith({ totalRows: expect.any(SQL) });
      expect(dbMock.from).toHaveBeenCalledWith(schema.rateLimitsUser);
      expect(dbMock.get).toHaveBeenCalledTimes(1);

      expect(dbMock.select).toHaveBeenCalledWith();
      expect(dbMock.from).toHaveBeenCalledWith(schema.rateLimitsUser);
      expect(dbMock.$dynamic).toHaveBeenCalledTimes(1);
      expect(dbMock.orderBy).toHaveBeenCalledWith(
        desc(schema.rateLimitsUser.userId),
        desc(schema.rateLimitsUser.apiType)
      );
      expect(dbMock.limit).toHaveBeenCalledWith(10);
      expect(dbMock.offset).toHaveBeenCalledWith(10);
      expect(dbMock.all).toHaveBeenCalledTimes(1);
    });

    it('should handle database error during transaction (e.g., COUNT fails)', async () => {
      const dbError = new Error('Transaction failed during count');
      dbMock.select.mockImplementationOnce(() => {
        // This select is for the count query
        const chainedMock = {
          from: vi.fn().mockReturnThis(),
          get: vi.fn().mockImplementationOnce(() => {
            throw dbError;
          }),
        };
        return chainedMock as any;
      });

      const result = await getTableData('users');
      expect(result).toEqual({ error: 'Failed to fetch table data' });
      expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    });

    it('should handle database error during transaction (e.g., SELECT data fails)', async () => {
      const dbError = new Error('Transaction failed during data select');
      dbMock.get.mockReturnValueOnce({ totalRows: 10 }); // Count succeeds
      dbMock.all.mockImplementationOnce(() => {
        throw dbError;
      }); // Data fetch fails

      const result = await getTableData('users');
      expect(result).toEqual({ error: 'Failed to fetch table data' });
      expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    });
  });
});
