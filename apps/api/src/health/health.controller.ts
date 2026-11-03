import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { DomainException } from '../common/errors/domain.exception';
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
    } catch (error) {
      // 503 indica "serviço indisponível" para o front e para monitores; a causa vai só para o log.
      throw new DomainException('SERVICE_UNAVAILABLE', 'Banco de dados indisponível', [], error);
    }
    return { status: 'ok', database: 'up' };
  }
}
