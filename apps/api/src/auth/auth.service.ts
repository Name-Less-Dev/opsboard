import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DomainException } from '../common/errors/domain.exception';
import { JwtService } from '@nestjs/jwt';
import { compare, hashSync } from 'bcrypt';
import { PublicUser, UsersService } from '../users/users.service';

export type JwtPayload = {
  sub: string;
};

export type LoginResult = {
  accessToken: string;
  user: PublicUser;
};

// Mesmo custo das senhas reais. E-mail inexistente também gasta o tempo do compare,
// para o tempo de resposta não revelar quais e-mails têm conta.
const DUMMY_PASSWORD_HASH = hashSync(randomUUID(), 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);
    const passwordMatches = await compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatches) {
      throw new DomainException('UNAUTHORIZED', 'Credenciais inválidas');
    }

    const payload: JwtPayload = { sub: user.id };
    return {
      accessToken: await this.jwt.signAsync(payload),
      // Campo a campo de propósito: um spread levaria o passwordHash junto.
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }
}
