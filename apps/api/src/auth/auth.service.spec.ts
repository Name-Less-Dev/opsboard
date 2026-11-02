import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { hashSync } from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const user = {
    id: 'user-1',
    name: 'Ana',
    email: 'ana@opsboard.dev',
    passwordHash: hashSync('senha-certa', 4), // custo baixo só para o teste ser rápido
    role: 'OPERATOR' as const,
    createdAt: new Date(),
  };
  const users = { findByEmail: jest.fn() };
  const jwt = { signAsync: jest.fn() };
  let service: AuthService;

  beforeEach(async () => {
    users.findByEmail.mockReset();
    jwt.signAsync.mockReset().mockResolvedValue('token-assinado');
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('devolve token e usuário sem o hash quando as credenciais estão certas', async () => {
    users.findByEmail.mockResolvedValue(user);

    const result = await service.login(user.email, 'senha-certa');

    expect(result).toEqual({
      accessToken: 'token-assinado',
      user: { id: 'user-1', name: 'Ana', email: user.email, role: 'OPERATOR' },
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'user-1' });
  });

  it('rejeita senha errada sem emitir token', async () => {
    users.findByEmail.mockResolvedValue(user);

    await expect(service.login(user.email, 'senha-errada')).rejects.toThrow(
      new UnauthorizedException('Credenciais inválidas'),
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rejeita e-mail inexistente com a mesma mensagem da senha errada', async () => {
    users.findByEmail.mockResolvedValue(null);

    await expect(service.login('ninguem@opsboard.dev', 'qualquer')).rejects.toThrow(
      new UnauthorizedException('Credenciais inválidas'),
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
