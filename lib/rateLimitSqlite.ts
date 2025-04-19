import db from './db';
import { getSession } from '@/app/auth'; // Assuming this returns { user: { id: string, dbId?: number } } | null
import * as Sentry from '@sentry/nextjs';

// --- Define Rate Limit Configurations ---
type ApiType = 'text' | 'image' | 'tts';

interface RateLimitConfig {
  requests: number;
  // durationSeconds is no longer used for daily limit logic, but kept for structure
  durationSeconds: number;
}

// Production limits (DAILY)
const LIMITS: Record<ApiType, RateLimitConfig> = {
  text: { requests: 100, durationSeconds: 24 * 60 * 60 }, // 100 requests per day
  image: { requests: 100, durationSeconds: 24 * 60 * 60 }, // 100 requests per day
  tts: { requests: 100, durationSeconds: 24 * 60 * 60 }, // 100 requests per day
};

type RateLimitErrorType = 'RateLimitExceeded' | 'AuthenticationRequired' | 'InternalError';

// Updated result type to potentially include structured error info
type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Timestamp in milliseconds when the limit *would* reset (start of next day UTC)
  errorType?: RateLimitErrorType;
  errorMessage?: string;
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

// --- Rate Limit Check Function (using SQLite) ---

const checkRateLimit = async (
  apiType: ApiType,
  config: RateLimitConfig
): Promise<RateLimitResult> => {
  const session = await getSession();
  const userId = session?.user?.dbId;

  if (!userId) {
    console.warn(`[RateLimitSQLite] Blocked unauthenticated request to ${apiType}`);
    return {
      success: false,
      limit: config.requests,
      remaining: 0,
      reset: 0, // No specific reset time for auth error
      errorType: 'AuthenticationRequired',
      errorMessage: 'Authentication required.',
    };
  }

  console.log(`[RateLimitSQLite] Checking DAILY ${apiType} limit for user DB ID ${userId}`);

  const now = Date.now();
  const startOfCurrentDay = getStartOfDayUTC(now);
  let actualResetTime = getStartOfNextDayUTC(now); // Default reset is next day

  try {
    const result = db.transaction((currentUserId: number, currentApiType: ApiType) => {
      const stmtSelect = db.prepare(`
        SELECT request_count, window_start_time
        FROM rate_limits_user
        WHERE user_id = ? AND api_type = ?
      `);
      const stmtInsert = db.prepare(`
        INSERT INTO rate_limits_user (user_id, api_type, window_start_time, request_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(user_id, api_type) DO NOTHING;
      `);
      const stmtUpdateReset = db.prepare(`
        UPDATE rate_limits_user
        SET request_count = 1, window_start_time = ?
        WHERE user_id = ? AND api_type = ?;
      `);
      const stmtUpdateIncrement = db.prepare(`
        UPDATE rate_limits_user
        SET request_count = request_count + 1
        WHERE user_id = ? AND api_type = ?;
      `);

      let row = stmtSelect.get(currentUserId, currentApiType) as
        | { request_count: number; window_start_time: number }
        | undefined;

      // Handle initial request for user/apiType combination
      if (!row) {
        stmtInsert.run(currentUserId, currentApiType, now);
        row = stmtSelect.get(currentUserId, currentApiType) as
          | { request_count: number; window_start_time: number }
          | undefined;
        if (!row) {
          throw new Error('Failed to insert or retrieve rate limit record after initial check.');
        }
      }

      const lastRequestTime = row.window_start_time; // Renamed for clarity
      const requestCount = row.request_count;
      const startOfLastRequestDay = getStartOfDayUTC(lastRequestTime);

      // Check if last request was from a previous day
      if (startOfLastRequestDay < startOfCurrentDay) {
        // Reset the count and update the timestamp to now
        stmtUpdateReset.run(now, currentUserId, currentApiType);
        actualResetTime = getStartOfNextDayUTC(now); // Reset is start of next day
        return { success: true, remaining: config.requests - 1 };
      } else {
        // Request is from the current day
        actualResetTime = getStartOfNextDayUTC(now); // Reset is still start of next day
        if (requestCount < config.requests) {
          // Increment count, keep same start time (timestamp not updated on increment)
          stmtUpdateIncrement.run(currentUserId, currentApiType);
          return { success: true, remaining: config.requests - (requestCount + 1) };
        } else {
          // Limit reached for today
          return { success: false, remaining: 0 };
        }
      }
    })(userId, apiType) as { success: boolean; remaining: number };

    console.log(
      `[RateLimitSQLite] DAILY ${apiType} check for user ${userId}: success=${result.success}, remaining=${result.remaining}`
    );

    if (!result.success) {
      console.warn(
        `[RateLimitSQLite] User ${userId} exceeded DAILY ${apiType} limit. Limit resets at ${new Date(actualResetTime).toISOString()} (UTC)`
      );
      return {
        success: false,
        limit: config.requests,
        remaining: 0,
        reset: actualResetTime,
        errorType: 'RateLimitExceeded',
        errorMessage: `Daily rate limit exceeded for ${apiType}.`,
      };
    }

    // On success, the reset time refers to the start of the next day
    return {
      ...result,
      limit: config.requests,
      reset: actualResetTime,
      errorType: undefined,
      errorMessage: undefined,
    };
  } catch (error) {
    console.error(
      `[RateLimitSQLite] Error checking DAILY ${apiType} limit for user ${userId}:`,
      error
    );
    Sentry.captureException(error, { tags: { rateLimitApiType: apiType, rateLimitUser: userId } });
    // Fail CLOSED: Deny request if rate limiter fails unexpectedly
    return {
      success: false,
      limit: config.requests,
      remaining: 0, // Assume limit reached if we can't check
      reset: now,
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
