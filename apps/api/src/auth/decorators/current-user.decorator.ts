import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PublicUser } from '../../users/users.service';

export type AuthenticatedRequest = Request & { user?: PublicUser };

// Lê o usuário que o JwtStrategy colocou na requisição.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
