import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';
import type { PublicUser } from '../../users/users.service';
import type { LoginResult } from '../auth.service';

// Classes só para a documentação: o Swagger lê decorators, e tipos do TS somem ao compilar.
export class UserResponseDto implements PublicUser {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Carla Supervisora' })
  name!: string;

  @ApiProperty({ example: 'supervisor@opsboard.dev' })
  email!: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;
}

export class LoginResponseDto implements LoginResult {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
