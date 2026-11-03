import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig, loadAppConfig } from './app-config';

@Global()
@Module({
  imports: [
    // Só carrega o .env da raiz do monorepo para o process.env (no host, o cwd é apps/api).
    // No Docker o arquivo não existe e as variáveis vêm do docker-compose.yml.
    ConfigModule.forRoot({ envFilePath: '../../.env' }),
  ],
  providers: [
    // A validação roda ao criar a aplicação: variável inválida derruba o boot com a lista de
    // problemas. Fábrica (e não `validate` do ConfigModule) para os testes poderem subir
    // aplicações com variáveis diferentes no mesmo processo.
    { provide: AppConfig, useFactory: () => loadAppConfig(process.env) },
  ],
  exports: [AppConfig],
})
export class AppConfigModule {}
