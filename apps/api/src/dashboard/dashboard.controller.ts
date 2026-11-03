import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/errors/api-errors.decorator';
import { type DashboardSummary, DashboardService } from './dashboard.service';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';

// Sem @Roles: todos os autenticados veem os mesmos números.
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Contadores por status e ordens atrasadas' })
  @ApiOkResponse({ type: DashboardSummaryDto })
  @ApiErrors(401)
  getSummary(): Promise<DashboardSummary> {
    return this.dashboard.getSummary();
  }
}
