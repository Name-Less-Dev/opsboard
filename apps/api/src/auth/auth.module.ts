import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from '../config/app-config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    // Contagem em memória, por processo: com mais de uma instância da API, cada uma conta à parte
    // (o limite efetivo vira N vezes o configurado). Aceito no MVP; sem Redis por decisão.
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => [
        {
          // Nome `default` mantém os headers padrão (Retry-After, X-RateLimit-*).
          name: 'default',
          limit: config.loginRateLimit,
          ttl: seconds(config.loginRateTtlSeconds),
        },
      ],
    }),
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtSecret,
        signOptions: {
          algorithm: 'HS256',
          // Validado em loadAppConfig no formato que o jsonwebtoken aceita.
          expiresIn: config.jwtExpiresIn as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // A ordem importa: primeiro autentica (401), depois checa o perfil (403).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
