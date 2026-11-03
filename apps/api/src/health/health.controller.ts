import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrors } from '../common/errors/api-errors.decorator';
import { DomainException } from '../common/errors/domain.exception';
import { PrismaService } from '../prisma/prisma.service';
import { HealthResponseDto } from './health-response.dto';

export type HealthResponse = {
  status: 'ok';
  database: 'up';
};

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Verifica se a API e o banco respondem' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiErrors(503)
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
