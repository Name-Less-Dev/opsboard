import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiErrors } from '../common/errors/api-errors.decorator';
import type { PublicUser } from '../users/users.service';
import { AuthService, type LoginResult } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginResponseDto, UserResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  // POST devolve 201 por padrão, mas o login não cria nenhum recurso.
  @HttpCode(200)
  // Só o login tem limite (por IP): é o alvo de tentativa de senha por força bruta.
  // Conta toda tentativa, certa ou errada, para não revelar quais deram certo.
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Autentica com e-mail e senha e devolve o access token' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiErrors(
    400,
    [401, 'UNAUTHORIZED: credenciais inválidas (mesma resposta para e-mail inexistente)'],
    429,
  )
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devolve o usuário autenticado' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiErrors(401)
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }
}
