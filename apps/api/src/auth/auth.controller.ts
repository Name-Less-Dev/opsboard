import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { PublicUser } from '../users/users.service';
import { AuthService, type LoginResult } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  // POST devolve 201 por padrão, mas o login não cria nenhum recurso.
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  me(@Req() request: Request & { user: PublicUser }): PublicUser {
    return request.user;
  }
}
