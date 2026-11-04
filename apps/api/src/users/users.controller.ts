import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiErrors } from '../common/errors/api-errors.decorator';
import { Role } from '../generated/prisma/enums';
import { UserSummaryDto } from './dto/user-summary.dto';
import { type UserSummary, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Só supervisor: é quem escolhe o responsável de uma ordem (criação e atribuição).
  @Get()
  @ApiOperation({ summary: 'Lista os usuários (id, nome e perfil), em ordem de nome' })
  @ApiOkResponse({ type: [UserSummaryDto] })
  @ApiErrors(401, 403)
  @Roles(Role.SUPERVISOR)
  findAll(): Promise<UserSummary[]> {
    return this.users.findAll();
  }
}
