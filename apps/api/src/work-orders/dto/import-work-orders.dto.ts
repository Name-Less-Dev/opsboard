import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { AsBoolean } from './list-work-orders.dto';

export class ImportWorkOrdersQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: '`true` só valida e devolve o relatório, sem gravar nada',
  })
  @IsOptional()
  @AsBoolean()
  @IsBoolean()
  dryRun: boolean = false;
}
