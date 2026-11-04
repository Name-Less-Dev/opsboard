import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';
import type { UserSummary } from '../users.service';

// Só o necessário para escolher um responsável: sem e-mail, hash ou datas.
export class UserSummaryDto implements UserSummary {
  @ApiProperty({ format: 'uuid', example: '9cbbf785-9a72-4703-b484-0afd39d65703' })
  id!: string;

  @ApiProperty({ example: 'Ana Operadora' })
  name!: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;
}
