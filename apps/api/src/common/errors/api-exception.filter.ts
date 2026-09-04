import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

import { ApiError } from './api-error';

type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: ApiError['details'];
    requestId: string;
  };
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();

    if (exception instanceof ApiError) {
      const body: ErrorResponse = {
        error: {
          code: exception.code,
          message: exception.message,
          requestId,
        },
      };

      if (exception.details) {
        body.error.details = exception.details;
      }

      response.status(exception.status).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({
        error: {
          code: this.codeForHttpStatus(exception.getStatus()),
          message: exception.message,
          requestId,
        },
      } satisfies ErrorResponse);
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      },
    } satisfies ErrorResponse);
  }

  private codeForHttpStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHENTICATED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'RESOURCE_NOT_FOUND';
      default:
        return 'HTTP_ERROR';
    }
  }
}
