import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkRateLimit, rateLimiters } from './rate-limit'

describe('rate-limit', () => {
  beforeEach(() => {
    // Clear the rate limit store between tests by using unique identifiers
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('checkRateLimit', () => {
    it('allows requests under the limit', () => {
      const config = { maxRequests: 5, windowMs: 60000 }
      const id = `test-${Date.now()}`

      const result = checkRateLimit(id, config)

      expect(result.success).toBe(true)
      expect(result.remaining).toBe(4)
    })

    it('tracks remaining requests correctly', () => {
      const config = { maxRequests: 3, windowMs: 60000 }
      const id = `test-remaining-${Date.now()}`

      expect(checkRateLimit(id, config).remaining).toBe(2)
      expect(checkRateLimit(id, config).remaining).toBe(1)
      expect(checkRateLimit(id, config).remaining).toBe(0)
    })

    it('blocks requests over the limit', () => {
      const config = { maxRequests: 2, windowMs: 60000 }
      const id = `test-block-${Date.now()}`

      checkRateLimit(id, config) // 1
      checkRateLimit(id, config) // 2
      const result = checkRateLimit(id, config) // 3 - should be blocked

      expect(result.success).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('resets after window expires', () => {
      const config = { maxRequests: 1, windowMs: 1000 }
      const id = `test-reset-${Date.now()}`

      checkRateLimit(id, config) // Use up the limit
      expect(checkRateLimit(id, config).success).toBe(false)

      // Advance time past the window
      vi.advanceTimersByTime(1001)

      const result = checkRateLimit(id, config)
      expect(result.success).toBe(true)
      expect(result.remaining).toBe(0)
    })

    it('returns correct resetIn time', () => {
      const config = { maxRequests: 5, windowMs: 60000 }
      const id = `test-resetin-${Date.now()}`

      const result = checkRateLimit(id, config)

      expect(result.resetIn).toBe(60000)
    })
  })

  describe('rateLimiters', () => {
    it('chat limiter allows 30 requests per minute', () => {
      const userId = `user-chat-${Date.now()}`

      // Make 30 requests - all should succeed
      for (let i = 0; i < 30; i++) {
        expect(rateLimiters.chat(userId).success).toBe(true)
      }

      // 31st should fail
      expect(rateLimiters.chat(userId).success).toBe(false)
    })

    it('aiHeavy limiter allows 10 requests per minute', () => {
      const userId = `user-heavy-${Date.now()}`

      for (let i = 0; i < 10; i++) {
        expect(rateLimiters.aiHeavy(userId).success).toBe(true)
      }

      expect(rateLimiters.aiHeavy(userId).success).toBe(false)
    })

    it('general limiter allows 100 requests per minute', () => {
      const userId = `user-general-${Date.now()}`

      for (let i = 0; i < 100; i++) {
        expect(rateLimiters.general(userId).success).toBe(true)
      }

      expect(rateLimiters.general(userId).success).toBe(false)
    })
  })
})
