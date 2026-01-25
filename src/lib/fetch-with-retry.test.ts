import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry, FetchError, postJsonWithRetry } from './fetch-with-retry'

describe('fetch-with-retry', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    mockFetch.mockReset()
  })

  describe('fetchWithRetry', () => {
    it('returns response on success', async () => {
      const mockResponse = new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const response = await fetchWithRetry('https://api.test.com/data')

      expect(response.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('retries on 500 error', async () => {
      const errorResponse = new Response('Server Error', { status: 500 })
      const successResponse = new Response('OK', { status: 200 })

      mockFetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse)

      const responsePromise = fetchWithRetry('https://api.test.com/data', {
        retries: 3,
        retryDelay: 100,
      })

      // Advance timers for retry delay
      await vi.advanceTimersByTimeAsync(100)

      const response = await responsePromise
      expect(response.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('retries on 429 rate limit', async () => {
      const rateLimitResponse = new Response('Rate Limited', {
        status: 429,
        headers: { 'Retry-After': '1' },
      })
      const successResponse = new Response('OK', { status: 200 })

      mockFetch
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(successResponse)

      const responsePromise = fetchWithRetry('https://api.test.com/data', {
        retries: 3,
        retryDelay: 100,
      })

      // Advance timers for Retry-After header (1 second = 1000ms)
      await vi.advanceTimersByTimeAsync(1000)

      const response = await responsePromise
      expect(response.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws FetchError on non-retryable error', async () => {
      const notFoundResponse = new Response(
        JSON.stringify({ error: 'Not found' }),
        { status: 404, statusText: 'Not Found' }
      )
      mockFetch.mockResolvedValueOnce(notFoundResponse)

      await expect(fetchWithRetry('https://api.test.com/data')).rejects.toThrow(
        FetchError
      )
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('retries on network error', async () => {
      const networkError = new TypeError('Failed to fetch')
      const successResponse = new Response('OK', { status: 200 })

      mockFetch
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(successResponse)

      const responsePromise = fetchWithRetry('https://api.test.com/data', {
        retries: 3,
        retryDelay: 100,
      })

      await vi.advanceTimersByTimeAsync(100)

      const response = await responsePromise
      expect(response.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('uses exponential backoff by default', async () => {
      const errorResponse = new Response('Error', { status: 500 })
      const successResponse = new Response('OK', { status: 200 })

      mockFetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse)

      const responsePromise = fetchWithRetry('https://api.test.com/data', {
        retries: 3,
        retryDelay: 100,
        exponentialBackoff: true,
      })

      // First retry: 100ms * 2^0 = 100ms
      await vi.advanceTimersByTimeAsync(100)
      // Second retry: 100ms * 2^1 = 200ms
      await vi.advanceTimersByTimeAsync(200)

      const response = await responsePromise
      expect(response.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('respects custom retry status codes', async () => {
      const customErrorResponse = new Response('Custom Error', { status: 418 })

      mockFetch.mockResolvedValue(customErrorResponse)

      // 418 is not in default retry codes, so it should not retry
      await expect(
        fetchWithRetry('https://api.test.com/data', { retries: 3 })
      ).rejects.toThrow(FetchError)

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('exhausts retries and throws', async () => {
      const errorResponse = new Response('Error', { status: 500 })
      mockFetch.mockResolvedValue(errorResponse)

      // Use try-catch to properly handle the rejection
      let caughtError: Error | null = null
      const responsePromise = fetchWithRetry('https://api.test.com/data', {
        retries: 2,
        retryDelay: 100,
      }).catch((e) => {
        caughtError = e
      })

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(200)
      await vi.advanceTimersByTimeAsync(400)

      await responsePromise
      expect(caughtError).toBeInstanceOf(FetchError)
      expect(mockFetch).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })
  })

  describe('postJsonWithRetry', () => {
    it('sends JSON POST request', async () => {
      const mockResponse = new Response(JSON.stringify({ result: 'success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      mockFetch.mockResolvedValueOnce(mockResponse)

      const result = await postJsonWithRetry<{ result: string }>(
        'https://api.test.com/data',
        { foo: 'bar' }
      )

      expect(result).toEqual({ result: 'success' })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/data',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ foo: 'bar' }),
        })
      )
    })
  })
})
