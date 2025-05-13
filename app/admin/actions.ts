'use server';

import db from '@/lib/db';
import { users, rateLimitsUser } from '@/lib/db/schema'; // Import Drizzle schema objects
import { sql, desc } from 'drizzle-orm'; // Removed asc
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { z } from 'zod';
import { TableNamesSchema, PaginatedTableDataSchema } from './schemas';

const ALLOWED_ADMIN_TABLE_MAP = {
  users: users,
  rate_limits_user: rateLimitsUser,
} as const;

type AllowedTableNames = keyof typeof ALLOWED_ADMIN_TABLE_MAP;

const isAdmin = async (): Promise<boolean> => {
  const session = await getServerSession(authOptions);
  if (!session?.user.email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  return adminEmails.includes(session.user.email);
};

interface RawTableNameResult {
  name: string;
}

// Drizzle doesn't have a direct API for sqlite_master, so we use a raw query here.
const getAllTableNamesRaw = (): RawTableNameResult[] => {
  try {
    // Use db.all() for querying with Drizzle and better-sqlite3
    return db.all<RawTableNameResult>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );
  } catch (error) {
    console.error('[Admin Actions] Error fetching table names via raw SQL:', error);
    return [];
  }
};

export const getTableNames = async (): Promise<{ error?: string; data?: string[] }> => {
  if (!(await isAdmin())) return { error: 'Unauthorized' };
  try {
    const rawNames = getAllTableNamesRaw();
    const tableNames = rawNames.map((table) => table.name);
    const parsed = TableNamesSchema.safeParse(tableNames);
    if (!parsed.success) {
      console.error('[Admin Actions] Failed to parse table names:', parsed.error);
      return { error: 'Failed to validate table names structure.' };
    }
    // Filter to only include allowed table names defined in our map for safety
    const allowedTableNames = parsed.data.filter((name) => name in ALLOWED_ADMIN_TABLE_MAP);
    return { data: allowedTableNames };
  } catch (error) {
    console.error('[Admin Actions] Unexpected error fetching table names:', error);
    return { error: 'Unexpected error fetching table names.' };
  }
};

export const getTableData = async (
  tableName: string,
  page: number = 1,
  limit: number = 10
): Promise<{ error?: string; data?: z.infer<typeof PaginatedTableDataSchema> }> => {
  if (!(await isAdmin())) return { error: 'Unauthorized' };

  if (!(tableName in ALLOWED_ADMIN_TABLE_MAP)) {
    console.warn(`[Admin Actions] Attempt to access disallowed or unknown table: ${tableName}`);
    return { error: 'Invalid or disallowed table name' };
  }
  const tableSchema = ALLOWED_ADMIN_TABLE_MAP[tableName as AllowedTableNames];

  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;

  try {
    const result = db.transaction(() => {
      const countResult = db
        .select({ totalRows: sql<number>`count(*)` })
        .from(tableSchema)
        .get();

      const totalRows = countResult?.totalRows ?? 0;

      // Initial select builder, correctly typed
      let selectBuilder = db.select().from(tableSchema).$dynamic();

      // Apply ordering based on tableName for type safety
      if (tableName === 'users') {
        selectBuilder = selectBuilder.orderBy(desc(users.lastLogin));
      } else if (tableName === 'rate_limits_user') {
        // Default sort for rate_limits_user, e.g., by userId then apiType
        selectBuilder = selectBuilder.orderBy(
          desc(rateLimitsUser.userId),
          desc(rateLimitsUser.apiType)
        );
      }
      // Add more specific ordering for other tables if needed
      // else if (tableSchema.id) { // A more generic approach if all tables had a common 'id' field
      //   selectBuilder = selectBuilder.orderBy(desc(tableSchema.id));
      // }

      const paginatedData = selectBuilder.limit(safeLimit).offset(offset).all();

      return {
        data: paginatedData as Record<string, unknown>[],
        totalRows,
        page: safePage,
        limit: safeLimit,
      };
    });

    const parsed = PaginatedTableDataSchema.safeParse(result);
    if (!parsed.success) {
      console.error(`[Admin Actions] Failed to parse data for table ${tableName}:`, parsed.error);
      return { error: 'Failed to validate table data structure.' };
    }

    return { data: parsed.data };
  } catch (error) {
    console.error(`[Admin Actions] Error fetching paginated data for table ${tableName}:`, error);
    return { error: 'Failed to fetch table data' };
  }
};
