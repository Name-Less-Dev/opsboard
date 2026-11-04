import { Injectable } from '@nestjs/common';
import type { Role, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Formato público do usuário: é o único que pode sair da API.
export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/** O que `GET /users` devolve: o mínimo para escolher um responsável. */
export type UserSummary = Pick<PublicUser, 'id' | 'name' | 'role'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Inclui passwordHash porque o login precisa dele. Uso interno: nunca devolver em resposta.
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // O select é uma lista de permissão: o hash nem chega a sair do banco.
  findById(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  // Desempate por id: dois usuários com o mesmo nome saem sempre na mesma ordem.
  findAll(): Promise<UserSummary[]> {
    return this.prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
}
