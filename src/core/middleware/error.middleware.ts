import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.config';
import { errorResponse, ErrorType, ErrorAction, ApiErrorDetail } from '../utils/responseFormatter';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly type: ErrorType;
  public readonly code: string;
  public readonly next_action: ErrorAction;
  public readonly retryable: boolean;

  constructor(
    message: string, 
    statusCode: number, 
    code: string = 'ERR_INTERNAL',
    type: ErrorType = 'SERVER',
    next_action: ErrorAction = 'NONE',
    retryable: boolean = false,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.type = type;
    this.next_action = next_action;
    this.retryable = retryable;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  public toApiErrorDetail(): ApiErrorDetail {
    return {
      type: this.type,
      code: this.code,
      user_message: this.message,
      next_action: this.next_action,
      retryable: this.retryable,
      // dev_message can be added here optionally if in Dev mode
    };
  }
}

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`AppError [${err.code}]: ${err.message}`, { stack: err.stack });
    } else {
      logger.warn(`AppError [${err.code}]: ${err.message}`);
    }
    
    res.status(err.statusCode).json(errorResponse(err.toApiErrorDetail()));
    return;
  }

  // Unexpected errors
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json(errorResponse({
    type: 'SERVER',
    code: 'ERR_SERVER_CRASH',
    user_message: 'Our servers are experiencing high traffic right now. Please try again shortly.',
    dev_message: err.message,
    next_action: 'RETRY',
    retryable: true
  }));
}
