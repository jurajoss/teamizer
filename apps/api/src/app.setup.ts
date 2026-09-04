import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import { ApiError, type ApiErrorDetail } from './common/errors/api-error';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';

function validationDetails(
  errors: ValidationError[],
  parentPath = '',
): ApiErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const ownDetails = Object.values(error.constraints ?? {}).map(
      (message) => ({
        field,
        code: 'INVALID_VALUE',
        message,
      }),
    );

    return [...ownDetails, ...validationDetails(error.children ?? [], field)];
  });
}

export function configureApplication(app: INestApplication): void {
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(createDtoValidationPipe());
}

export function createDtoValidationPipe(
  expectedType?: Type<unknown>,
): ValidationPipe {
  return new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
    ...(expectedType ? { expectedType } : {}),
    exceptionFactory: (errors) =>
      new ApiError(
        400,
        'VALIDATION_ERROR',
        'Request validation failed.',
        validationDetails(errors),
      ),
  });
}
