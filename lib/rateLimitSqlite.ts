import db from './db';
import { getSession } from '@/app/auth'; // Assuming this returns { user: { id: string, dbId?: number } } | null
import * as Sentry from '@sentry/nextjs';

// --- Define Rate Limit Configurations ---
type ApiType = 'text' | 'image' | 'tts';

interface RateLimitConfig {
  requests: number;
  durationSeconds: number; // Window duration in seconds
}

// Production limits
const LIMITS: Record<ApiType, RateLimitConfig> = {
  text: { requests: 100, durationSeconds: 3600 }, // 100 requests per 1 hour
  image: { requests: 100, durationSeconds: 3600 }, // 100 requests per 1 hour
  tts: { requests: 100, durationSeconds: 3600 }, // 100 requests per 1 hour
};

type RateLimitErrorType = 'RateLimitExceeded' | 'AuthenticationRequired' | 'InternalError';

// Updated result type to potentially include structured error info
type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Timestamp in milliseconds when the limit *would* reset
  errorType?: RateLimitErrorType;
  errorMessage?: string;
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

  console.log(`[RateLimitSQLite] Checking ${apiType} limit for user DB ID ${userId}`);

  const now = Date.now();
  const windowStartThreshold = now - config.durationSeconds * 1000;
  let actualResetTime = now + config.durationSeconds * 1000;

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

      const windowStartTime = row.window_start_time;
      const requestCount = row.request_count;

      // Check if window is expired
      if (windowStartTime < windowStartThreshold) {
        stmtUpdateReset.run(now, currentUserId, currentApiType);
        actualResetTime = now + config.durationSeconds * 1000;
        return { success: true, remaining: config.requests - 1 };
      } else {
        // Window is current
        actualResetTime = windowStartTime + config.durationSeconds * 1000;
        if (requestCount < config.requests) {
          stmtUpdateIncrement.run(currentUserId, currentApiType);
          return { success: true, remaining: config.requests - (requestCount + 1) };
        } else {
          // Limit reached
          return { success: false, remaining: 0 };
        }
      }
    })(userId, apiType) as { success: boolean; remaining: number };

    console.log(
      `[RateLimitSQLite] ${apiType} check for user ${userId}: success=${result.success}, remaining=${result.remaining}`
    );

    if (!result.success) {
      console.warn(
        `[RateLimitSQLite] User ${userId} exceeded ${apiType} limit. Limit resets at ${new Date(actualResetTime).toISOString()}`
      );
      return {
        success: false,
        limit: config.requests,
        remaining: 0,
        reset: actualResetTime,
        errorType: 'RateLimitExceeded',
        errorMessage: `Rate limit exceeded for ${apiType}.`,
      };
    }

    // On success, the reset time still refers to when the current window *would* end
    return {
      ...result,
      limit: config.requests,
      reset: actualResetTime,
      errorType: undefined,
      errorMessage: undefined,
    };
  } catch (error) {
    console.error(`[RateLimitSQLite] Error checking ${apiType} limit for user ${userId}:`, error);
    Sentry.captureException(error, { tags: { rateLimitApiType: apiType, rateLimitUser: userId } });
    // Fail open: Allow request but log error if rate limiter fails unexpectedly
    return {
      success: true, // Still true because we are failing open
      limit: config.requests,
      remaining: config.requests,
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
