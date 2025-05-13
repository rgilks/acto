import db from './db';
import * as schema from './db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getSession } from '@/app/auth'; // Assuming this returns { user: { id: string, dbId?: number } } | null

// --- Define Rate Limit Configurations ---
type ApiType = 'text' | 'image' | 'tts';

interface RateLimitConfig {
  requests: number;
  durationSeconds: number; // Kept for structure, daily logic relies on date comparison
}

// Production limits (DAILY)
const LIMITS: Record<ApiType, RateLimitConfig> = {
  text: { requests: 100, durationSeconds: 24 * 60 * 60 }, // 100 requests per day
  image: { requests: 100, durationSeconds: 24 * 60 * 60 }, // 100 requests per day
  tts: { requests: 100, durationSeconds: 24 * 60 * 60 }, // 100 requests per day
};

type RateLimitErrorType = 'RateLimitExceeded' | 'AuthenticationRequired' | 'InternalError';

// Updated result type to potentially include structured error info
export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Timestamp in milliseconds (start of next day UTC)
  errorType?: RateLimitErrorType | undefined;
  errorMessage?: string | undefined;
};

// Helper to get the start of the current day in UTC milliseconds
const getStartOfDayUTC = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
};

// Helper to get the start of the next day in UTC milliseconds
const getStartOfNextDayUTC = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
};

// --- Rate Limit Check Function (using Drizzle ORM) ---

const checkRateLimit = async (
  apiType: ApiType,
  config: RateLimitConfig
): Promise<RateLimitResult> => {
  const session = await getSession();
  const userId = session?.user.dbId;

  if (!userId) {
    console.warn(`[RateLimitDrizzle] Blocked unauthenticated request to ${apiType}`);
    return {
      success: false,
      limit: config.requests,
      remaining: 0,
      reset: 0,
      errorType: 'AuthenticationRequired',
      errorMessage: 'Authentication required.',
    };
  }

  console.log(`[RateLimitDrizzle] Checking DAILY ${apiType} limit for user DB ID ${userId}`);

  const nowMs = Date.now();
  const startOfCurrentDayMs = getStartOfDayUTC(nowMs);
  let actualResetTimeMs = getStartOfNextDayUTC(nowMs);

  try {
    const result = db.transaction((tx) => {
      const record = tx
        .select({
          requestCount: schema.rateLimitsUser.requestCount,
          windowStartTime: schema.rateLimitsUser.windowStartTime,
        })
        .from(schema.rateLimitsUser)
        .where(
          and(eq(schema.rateLimitsUser.userId, userId), eq(schema.rateLimitsUser.apiType, apiType))
        )
        .get();

      if (!record) {
        tx.insert(schema.rateLimitsUser)
          .values({
            userId: userId,
            apiType: apiType,
            windowStartTime: new Date(nowMs),
            requestCount: 1,
          })
          .run();
        return { success: true, remaining: config.requests - 1 };
      }

      const lastRequestTimeMs = record.windowStartTime.getTime();
      const requestCount = record.requestCount;
      const startOfLastRequestDayMs = getStartOfDayUTC(lastRequestTimeMs);

      if (startOfLastRequestDayMs < startOfCurrentDayMs) {
        tx.update(schema.rateLimitsUser)
          .set({
            requestCount: 1,
            windowStartTime: new Date(nowMs),
          })
          .where(
            and(
              eq(schema.rateLimitsUser.userId, userId),
              eq(schema.rateLimitsUser.apiType, apiType)
            )
          )
          .run();
        actualResetTimeMs = getStartOfNextDayUTC(nowMs);
        return { success: true, remaining: config.requests - 1 };
      } else {
        actualResetTimeMs = getStartOfNextDayUTC(nowMs);
        if (requestCount < config.requests) {
          tx.update(schema.rateLimitsUser)
            .set({ requestCount: sql`${schema.rateLimitsUser.requestCount} + 1` })
            .where(
              and(
                eq(schema.rateLimitsUser.userId, userId),
                eq(schema.rateLimitsUser.apiType, apiType)
              )
            )
            .run();
          return { success: true, remaining: config.requests - (requestCount + 1) };
        } else {
          return { success: false, remaining: 0 };
        }
      }
    });

    console.log(
      `[RateLimitDrizzle] DAILY ${apiType} check for user ${userId}: success=${result.success}, remaining=${result.remaining}`
    );

    if (!result.success) {
      console.warn(
        `[RateLimitDrizzle] User ${userId} exceeded DAILY ${apiType} limit. Limit resets at ${new Date(actualResetTimeMs).toISOString()} (UTC)`
      );
      return {
        success: false,
        limit: config.requests,
        remaining: 0,
        reset: actualResetTimeMs,
        errorType: 'RateLimitExceeded',
        errorMessage: `Daily rate limit exceeded for ${apiType}.`,
      };
    }

    return {
      ...result,
      limit: config.requests,
      reset: actualResetTimeMs,
      errorType: undefined,
      errorMessage: undefined,
    };
  } catch (error) {
    console.error(
      `[RateLimitDrizzle] Error checking DAILY ${apiType} limit for user ${userId}:`,
      error
    );
    return {
      success: false,
      limit: config.requests,
      remaining: 0,
      reset: nowMs,
      errorType: 'InternalError',
      errorMessage: 'Rate limit check failed due to an internal error.',
    };
  }
};

export const checkTextRateLimit = async (): Promise<RateLimitResult> => {
  return checkRateLimit('text', LIMITS.text);
};

export const checkImageRateLimit = async (): Promise<RateLimitResult> => {
  return checkRateLimit('image', LIMITS.image);
};

export const checkTTSRateLimit = async (): Promise<RateLimitResult> => {
  return checkRateLimit('tts', LIMITS.tts);
};
