import { ParseUUIDPipe } from '@nestjs/common';
import { validationError } from '../errors/domain.exception';

// `:id` malformado vira VALIDATION_ERROR com o campo, como os erros de corpo e de query.
export const parseIdPipe = () =>
  new ParseUUIDPipe({
    exceptionFactory: () => validationError([{ field: 'id', messages: ['id must be a UUID'] }]),
  });
