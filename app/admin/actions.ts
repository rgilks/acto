'use server';

import db from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import * as Sentry from '@sentry/nextjs';

const isAdmin = async (): Promise<boolean> => {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return false;
  }

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email);

  return adminEmails.includes(session.user.email);
};

interface TableNameResult {
  name: string;
}

const getAllTableNames = (): string[] => {
  try {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all() as TableNameResult[];
    return tables.map((table) => table.name);
  } catch (error) {
    console.error('[Admin Actions] Error fetching table names:', error);
    Sentry.captureException(error);
    return [];
  }
};

interface PaginatedTableData {
  data: Record<string, unknown>[];
  totalRows: number;
  page: number;
  limit: number;
}

interface CountResult {
  totalRows: number;
}

export const getTableNames = async (): Promise<{ error?: string; data?: string[] }> => {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }
  const tableNames = getAllTableNames();
  return { data: tableNames };
};

export const getTableData = async (
  tableName: string,
  page: number = 1,
  limit: number = 10
): Promise<{ error?: string; data?: PaginatedTableData }> => {
  if (!(await isAdmin())) {
    return { error: 'Unauthorized' };
  }

  const allowedTableNames = getAllTableNames();
  if (!allowedTableNames.includes(tableName)) {
    console.warn(`[Admin Actions] Attempt to access disallowed table: ${tableName}`);
    return { error: 'Invalid table name' };
  }

  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;

  try {
    let orderByClause = 'ORDER BY ROWID DESC';
    if (tableName === 'users' && allowedTableNames.includes('users')) {
      orderByClause = 'ORDER BY last_login DESC';
    }

    const result = db.transaction(() => {
      const countResult = db
        .prepare(`SELECT COUNT(*) as totalRows FROM "${tableName}"`)
        .get() as CountResult;
      const totalRows = countResult.totalRows;

      const query = `SELECT * FROM "${tableName}" ${orderByClause} LIMIT ? OFFSET ?`;
      const paginatedData = db.prepare(query).all(safeLimit, offset);

      return {
        data: paginatedData as Record<string, unknown>[],
        totalRows,
        page: safePage,
        limit: safeLimit,
      };
    })();

    return { data: result };
  } catch (error) {
    console.error(`[Admin Actions] Error fetching paginated data for table ${tableName}:`, error);
    Sentry.captureException(error, { extra: { tableName, page, limit } });
    return { error: 'Failed to fetch table data' };
  }
};
