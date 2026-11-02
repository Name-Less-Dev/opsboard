import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

export class UpdateAssigneeDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'null remove o responsável',
  })
  // `null` remove o responsável. O campo é obrigatório: ausente dá 400, para não remover por engano.
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  assigneeId!: string | null;
}
