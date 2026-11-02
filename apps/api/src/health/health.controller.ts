import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

export type HealthResponse = {
  status: 'ok';
  database: 'up';
};

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // 503 indica "serviço indisponível" para o front e para monitores.
      throw new ServiceUnavailableException('Banco de dados indisponível');
    }
    return { status: 'ok', database: 'up' };
  }
}
