// Placeholder for Drizzle schema
// We will define tables and columns here

import { sqliteTable, text, integer, primaryKey, unique, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    providerId: text('provider_id').notNull(),
    provider: text('provider').notNull(),
    name: text('name'),
    email: text('email'),
    image: text('image'),
    firstLogin: integer('first_login', { mode: 'timestamp' })
      .default(sql`(strftime('%s', 'now'))`)
      .notNull(),
    lastLogin: integer('last_login', { mode: 'timestamp' })
      .default(sql`(strftime('%s', 'now'))`)
      .notNull(),
    language: text('language').default('en'),
  },
  (table) => ({
    providerProviderIdIdx: unique('provider_provider_id_idx').on(table.providerId, table.provider),
    lastLoginIdx: index('idx_users_last_login').on(table.lastLogin),
  })
);

export const rateLimitsUser = sqliteTable(
  'rate_limits_user',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    apiType: text('api_type', { enum: ['text', 'image', 'tts'] }).notNull(),
    windowStartTime: integer('window_start_time', { mode: 'timestamp' })
      .default(sql`(strftime('%s', 'now'))`)
      .notNull(),
    requestCount: integer('request_count').notNull().default(1),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.apiType] }),
    userApiTypeWindowIdx: index('idx_rate_limits_user_window').on(
      table.userId,
      table.apiType,
      table.windowStartTime
    ),
  })
);

// Commented out lines below will be removed
// // import { relations } from 'drizzle-orm';
// // export const usersRelations = relations(users, ({ many }) => ({
// //   rateLimits: many(rateLimitsUser),
// // }));
// // export const rateLimitsUserRelations = relations(rateLimitsUser, ({ one }) => ({
// //   user: one(users, {
// //     fields: [rateLimitsUser.userId],
// //     references: [users.id],
// //   }),
// // }));

export {}; // Add an empty export to make this a module
