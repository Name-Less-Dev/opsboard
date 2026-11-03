import { Transform } from 'class-transformer';
import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches, registerDecorator, type ValidationArguments } from 'class-validator';

// Com `transform: true` no ValidationPipe, roda antes das validações de tamanho.
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

// `2026-11-05` também é ISO 8601, mas viraria meia-noite UTC: "hoje" já estaria no passado.
// Exigir hora e fuso elimina a ambiguidade de qual instante o cliente quis dizer.
const DATE_TIME_WITH_ZONE = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export const IsDateTimeWithZone = () =>
  applyDecorators(
    IsISO8601({ strict: true }),
    Matches(DATE_TIME_WITH_ZONE, {
      message: '$property deve ter data e hora com fuso (ex.: 2026-11-05T18:00:00-03:00)',
    }),
  );

// Compara com outro campo do mesmo DTO. Se algum dos dois faltar ou for inválido, não opina:
// a ausência e o formato já são checados pelos outros decorators.
export function IsNotBefore(otherProperty: string) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isNotBefore',
      target: target.constructor,
      propertyName,
      constraints: [otherProperty],
      options: { message: '$property não pode ser anterior a $constraint1' },
      validator: {
        validate: (value: unknown, args: ValidationArguments) => {
          const other = (args.object as Record<string, unknown>)[otherProperty];
          if (typeof value !== 'string' || typeof other !== 'string') return true;
          const [end, start] = [new Date(value).getTime(), new Date(other).getTime()];
          return Number.isNaN(end) || Number.isNaN(start) || end >= start;
        },
      },
    });
  };
}

export function IsNotInPast() {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isNotInPast',
      target: target.constructor,
      propertyName,
      options: { message: '$property não pode estar no passado' },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && new Date(value).getTime() >= Date.now(),
      },
    });
  };
}
