import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DomainException } from '../common/errors/domain.exception';
import { PublicUser, UsersService } from '../users/users.service';
import type { JwtPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  // Só roda com assinatura e expiração válidas. O retorno vira request.user.
  // Buscar no banco garante perfil atualizado e invalida o token de usuário removido.
  async validate(payload: JwtPayload): Promise<PublicUser> {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new DomainException('UNAUTHORIZED', 'Autenticação necessária');
    }
    return user;
  }
}
