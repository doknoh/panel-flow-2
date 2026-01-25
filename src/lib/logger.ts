/**
 * Structured logging utility for Panel Flow
 *
 * In development: logs to console with structured formatting
 * In production: can be extended to send to external services (Sentry, LogRocket, etc.)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  userId?: string
  seriesId?: string
  issueId?: string
  pageId?: string
  panelId?: string
  action?: string
  duration?: number
  [key: string]: unknown
}

interface LogEntry {
  level: LogLevel
  message: string
  context?: LogContext
  timestamp: string
  environment: string
}

const isDev = process.env.NODE_ENV === 'development'

function formatLogEntry(entry: LogEntry): string {
  const contextStr = entry.context
    ? ` ${JSON.stringify(entry.context)}`
    : ''
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${contextStr}`
}

function createLogEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
  return {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  }
}

function log(level: LogLevel, message: string, context?: LogContext) {
  const entry = createLogEntry(level, message, context)

  if (isDev) {
    // In development, log to console with colors
    const formatted = formatLogEntry(entry)
    switch (level) {
      case 'debug':
        console.debug(formatted)
        break
      case 'info':
        console.info(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      case 'error':
        console.error(formatted)
        break
    }
  } else {
    // In production, use structured logging
    // This can be picked up by Vercel's log drain or sent to external service
    console.log(JSON.stringify(entry))
  }

  // Future: Send to external monitoring service
  // if (level === 'error') {
  //   Sentry.captureMessage(message, { extra: context })
  // }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
}

/**
 * Track performance of async operations
 */
export async function trackPerformance<T>(
  name: string,
  operation: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const start = performance.now()
  try {
    const result = await operation()
    const duration = Math.round(performance.now() - start)
    logger.info(`${name} completed`, { ...context, duration, action: name })
    return result
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error(`${name} failed`, {
      ...context,
      duration,
      action: name,
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}

/**
 * Create a scoped logger with preset context
 */
export function createScopedLogger(baseContext: LogContext) {
  return {
    debug: (message: string, context?: LogContext) =>
      logger.debug(message, { ...baseContext, ...context }),
    info: (message: string, context?: LogContext) =>
      logger.info(message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      logger.warn(message, { ...baseContext, ...context }),
    error: (message: string, context?: LogContext) =>
      logger.error(message, { ...baseContext, ...context }),
  }
}

/**
 * Log API route handler wrapper
 */
export function withLogging<T>(
  handler: (req: Request) => Promise<T>,
  routeName: string
): (req: Request) => Promise<T> {
  return async (req: Request) => {
    const start = performance.now()
    const requestId = crypto.randomUUID().slice(0, 8)

    logger.info(`API ${routeName} started`, {
      action: routeName,
      requestId,
      method: req.method,
      url: req.url,
    })

    try {
      const result = await handler(req)
      const duration = Math.round(performance.now() - start)
      logger.info(`API ${routeName} completed`, {
        action: routeName,
        requestId,
        duration,
      })
      return result
    } catch (error) {
      const duration = Math.round(performance.now() - start)
      logger.error(`API ${routeName} failed`, {
        action: routeName,
        requestId,
        duration,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}
