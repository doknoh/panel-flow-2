/**
 * Fetch wrapper with automatic retry for transient failures
 */

export interface FetchWithRetryOptions extends RequestInit {
  /** Number of retry attempts (default: 3) */
  retries?: number
  /** Base delay between retries in ms (default: 1000) */
  retryDelay?: number
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff?: boolean
  /** HTTP status codes that should trigger a retry (default: [408, 429, 500, 502, 503, 504]) */
  retryStatusCodes?: number[]
}

export class FetchError extends Error {
  status: number
  statusText: string
  retryAfter?: number

  constructor(message: string, status: number, statusText: string, retryAfter?: number) {
    super(message)
    this.name = 'FetchError'
    this.status = status
    this.statusText = statusText
    this.retryAfter = retryAfter
  }
}

const DEFAULT_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504]

/**
 * Fetch with automatic retry for transient failures
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    retryDelay = 1000,
    exponentialBackoff = true,
    retryStatusCodes = DEFAULT_RETRY_STATUS_CODES,
    ...fetchOptions
  } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions)

      // Success - return response
      if (response.ok) {
        return response
      }

      // Check if we should retry this status code
      if (retryStatusCodes.includes(response.status) && attempt < retries) {
        // Get retry delay from header if available (for rate limiting)
        const retryAfterHeader = response.headers.get('Retry-After')
        const retryAfterMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : exponentialBackoff
            ? retryDelay * Math.pow(2, attempt)
            : retryDelay

        console.warn(
          `Request to ${url} failed with status ${response.status}, retrying in ${retryAfterMs}ms (attempt ${attempt + 1}/${retries})`
        )

        await sleep(retryAfterMs)
        continue
      }

      // Non-retryable error
      const errorBody = await response.text().catch(() => '')
      const retryAfter = response.headers.get('Retry-After')
      let errorMessage = `Request failed with status ${response.status}`

      try {
        const errorJson = JSON.parse(errorBody)
        if (errorJson.error) {
          errorMessage = errorJson.error
        }
      } catch {
        // Body wasn't JSON, use default message
      }

      throw new FetchError(
        errorMessage,
        response.status,
        response.statusText,
        retryAfter ? parseInt(retryAfter, 10) : undefined
      )
    } catch (error) {
      lastError = error as Error

      // Network errors should be retried
      if (error instanceof TypeError && attempt < retries) {
        const delayMs = exponentialBackoff
          ? retryDelay * Math.pow(2, attempt)
          : retryDelay

        console.warn(
          `Network error for ${url}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries})`
        )

        await sleep(delayMs)
        continue
      }

      // Re-throw FetchErrors as-is
      if (error instanceof FetchError) {
        throw error
      }

      // Wrap other errors
      throw new FetchError(
        (error as Error).message || 'Network request failed',
        0,
        'Network Error'
      )
    }
  }

  // All retries exhausted
  throw lastError || new FetchError('Request failed after all retries', 0, 'Unknown')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Convenience wrapper for JSON POST requests with retry
 */
export async function postJsonWithRetry<T>(
  url: string,
  body: unknown,
  options: Omit<FetchWithRetryOptions, 'method' | 'body'> = {}
): Promise<T> {
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
    ...options,
  })

  return response.json()
}
