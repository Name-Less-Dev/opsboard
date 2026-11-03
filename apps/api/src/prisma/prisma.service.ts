import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../config/app-config';
import { PrismaClient } from '../generated/prisma/client';

// Não chamamos $connect() no onModuleInit: a conexão abre na primeira query.
// Assim a API sobe mesmo com o banco fora do ar e o /health consegue reportar o erro.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
