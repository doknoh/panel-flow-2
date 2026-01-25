/**
 * Simple in-memory rate limiter for API routes.
 * For production with multiple instances, use Redis instead.
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean every minute

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number
  /** Time window in milliseconds */
  windowMs: number
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetIn: number
}

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (e.g., user ID or IP)
 * @param config - Rate limit configuration
 * @returns Whether the request is allowed and remaining quota
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(identifier)

  // No existing entry or window expired - create new entry
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs,
    })
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetIn: config.windowMs,
    }
  }

  // Within window - check if under limit
  if (entry.count < config.maxRequests) {
    entry.count++
    return {
      success: true,
      remaining: config.maxRequests - entry.count,
      resetIn: entry.resetTime - now,
    }
  }

  // Rate limited
  return {
    success: false,
    remaining: 0,
    resetIn: entry.resetTime - now,
  }
}

/**
 * Pre-configured rate limiters for different use cases
 */
export const rateLimiters = {
  // AI chat: 30 requests per minute per user
  chat: (userId: string) => checkRateLimit(`chat:${userId}`, {
    maxRequests: 30,
    windowMs: 60 * 1000,
  }),

  // AI heavy operations (outline sync, continuity): 10 per minute
  aiHeavy: (userId: string) => checkRateLimit(`ai-heavy:${userId}`, {
    maxRequests: 10,
    windowMs: 60 * 1000,
  }),

  // General API: 100 requests per minute
  general: (userId: string) => checkRateLimit(`general:${userId}`, {
    maxRequests: 100,
    windowMs: 60 * 1000,
  }),
}
