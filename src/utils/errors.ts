/**
 * Standardized error types and helpers.
 */

export type ErrorSeverity = 'fatal' | 'error' | 'warn'

export interface SerializedError {
  name: string
  message: string
  code?: string
  status?: number
  severity?: ErrorSeverity
  details?: unknown
  stack?: string
  cause?: SerializedError
}

export class AppError extends Error {
  code?: string
  status?: number
  severity: ErrorSeverity
  details?: unknown
  override cause?: unknown

  constructor(message: string, opts?: { code?: string; status?: number; severity?: ErrorSeverity; details?: unknown; cause?: unknown }) {
    super(message)
    this.name = this.constructor.name
    this.code = opts?.code
    this.status = opts?.status
    this.severity = opts?.severity ?? 'error'
    this.details = opts?.details
    this.cause = opts?.cause
  }

  toJSON(): SerializedError {
    return serializeError(this)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'VALIDATION_ERROR', status: 400, details, severity: 'warn' })
  }
}

export class AuthError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'AUTH_ERROR', status: 401, details })
  }
}

export class PermissionError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'FORBIDDEN', status: 403, details })
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'NOT_FOUND', status: 404, details, severity: 'warn' })
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'RATE_LIMITED', status: 429, details, severity: 'warn' })
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'EXTERNAL_SERVICE_ERROR', status: 502, details })
  }
}

export class CircuitBreakerError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'CIRCUIT_OPEN', status: 503, details })
  }
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof AppError) {
    return {
      name: err.name,
      message: err.message,
      code: err.code,
      status: err.status,
      severity: err.severity,
      details: err.details,
      stack: err.stack,
      cause: err.cause ? serializeError(err.cause as any) : undefined,
    }
  }
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    }
  }
  return { name: 'Error', message: String(err) }
}

export function deserializeError(obj: SerializedError): AppError {
  const err = new AppError(obj.message, {
    code: obj.code,
    status: obj.status,
    severity: obj.severity,
    details: obj.details,
    cause: obj.cause ? deserializeError(obj.cause) : undefined,
  })
  err.name = obj.name
  err.stack = obj.stack
  return err
}

export function withErrorContext<T>(fn: () => Promise<T>, context: Record<string, unknown>): Promise<T> {
  return fn().catch((e) => {
    if (e instanceof AppError) throw new AppError(e.message, { ...e, details: { ...(e.details as any), ...context } })
    const err = new AppError('Unhandled error', { code: 'UNHANDLED', details: { cause: serializeError(e), ...context } })
    throw err
  })
}

export function stackTrace(e?: Error): string {
  const err = e ?? new Error('stack')
  return err.stack || ''
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}
