import { OmitType } from '@nestjs/swagger';
import { ListWorkOrdersDto } from './list-work-orders.dto';

// Mesmos filtros e ordenação da lista, sem paginação. Como `page` e `pageSize` deixam de existir
// no DTO, o ValidationPipe (forbidNonWhitelisted) recusa os dois com 400.
export class ExportWorkOrdersDto extends OmitType(ListWorkOrdersDto, ['page', 'pageSize']) {}
