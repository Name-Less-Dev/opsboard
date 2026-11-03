import { ApiProperty } from '@nestjs/swagger';
import type { HealthResponse } from './health.controller';

export class HealthResponseDto implements HealthResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ enum: ['up'] })
  database!: 'up';
}
