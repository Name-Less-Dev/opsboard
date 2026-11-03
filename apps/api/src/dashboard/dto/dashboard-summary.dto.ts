import { ApiProperty } from '@nestjs/swagger';
import { WorkOrderResponseDto } from '../../work-orders/dto/work-order-response.dto';
import type { DashboardSummary } from '../dashboard.service';

// Classes só para a documentação: o `implements` faz o compilador acusar se divergirem do service.
class StatusCountsDto implements Record<keyof DashboardSummary['byStatus'], number> {
  @ApiProperty()
  OPEN!: number;

  @ApiProperty()
  IN_PROGRESS!: number;

  @ApiProperty()
  DONE!: number;

  @ApiProperty()
  CANCELLED!: number;
}

class OverdueDto {
  @ApiProperty({ description: 'Total de ordens atrasadas' })
  count!: number;

  @ApiProperty({
    type: [WorkOrderResponseDto],
    description: 'Até 10 atrasadas, prazo mais antigo primeiro',
  })
  items!: WorkOrderResponseDto[];
}

export class DashboardSummaryDto implements DashboardSummary {
  @ApiProperty({ type: StatusCountsDto, description: 'Sempre com as 4 chaves; 0 quando vazio' })
  byStatus!: StatusCountsDto;

  @ApiProperty({ type: OverdueDto })
  overdue!: OverdueDto;

  @ApiProperty({ description: 'Instante usado como "agora" no cálculo de atrasadas' })
  generatedAt!: Date;
}
