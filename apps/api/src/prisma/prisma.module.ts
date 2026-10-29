import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global: todos os módulos usam o mesmo PrismaService (um único pool de conexões)
// sem precisar importar o PrismaModule em cada um.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
