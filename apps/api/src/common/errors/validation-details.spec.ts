// Sem o Nest no teste, ninguém importa o reflect-metadata, de que o @Type depende.
import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import { IsEnum, IsInt, IsString, Length, Max, ValidateNested, validate } from 'class-validator';
import type { ValidationError } from 'class-validator';
import { toValidationDetails } from './validation-details';

// Erros reais do class-validator, gerados por DTOs de exemplo, em vez de objetos montados à mão:
// assim o teste quebra se o formato da biblioteca mudar.
enum Color {
  RED = 'RED',
}

class Child {
  @IsString()
  name!: string;
}

class Sample {
  @IsString()
  @Length(3, 10)
  title!: string;

  @IsEnum(Color)
  color!: Color;

  @Type(() => Number)
  @IsInt()
  @Max(100)
  pageSize!: number;

  @ValidateNested()
  @Type(() => Child)
  child!: Child;

  @ValidateNested({ each: true })
  @Type(() => Child)
  items!: Child[];
}

async function errorsFor(plain: object): Promise<ValidationError[]> {
  return validate(plainToInstance(Sample, plain), { whitelist: true, forbidNonWhitelisted: true });
}

const VALID = { title: 'ok-ok', color: 'RED', pageSize: 10, child: { name: 'a' }, items: [] };

describe('toValidationDetails', () => {
  it('sem erros, lista vazia', async () => {
    expect(toValidationDetails(await errorsFor(VALID))).toEqual([]);
  });

  it('uma entrada por campo, com todas as mensagens daquele campo', async () => {
    const details = toValidationDetails(await errorsFor({ ...VALID, title: 7 }));
    expect(details).toHaveLength(1);
    expect(details[0].field).toBe('title');
    expect(details[0].messages).toHaveLength(2); // não é string e não tem o tamanho certo
  });

  it('vários campos inválidos, inclusive número vindo como texto de query', async () => {
    const details = toValidationDetails(
      await errorsFor({ ...VALID, color: 'BLUE', pageSize: '101' }),
    );
    expect(details.map((d) => d.field).sort()).toEqual(['color', 'pageSize']);
  });

  it('campo extra (forbidNonWhitelisted) aparece com o próprio nome', async () => {
    const details = toValidationDetails(await errorsFor({ ...VALID, cor: 'azul' }));
    expect(details).toEqual([{ field: 'cor', messages: ['property cor should not exist'] }]);
  });

  it('campo aninhado vira caminho com ponto', async () => {
    const details = toValidationDetails(await errorsFor({ ...VALID, child: { name: 1 } }));
    expect(details).toEqual([{ field: 'child.name', messages: ['name must be a string'] }]);
  });

  it('item de lista usa o índice no caminho', async () => {
    const details = toValidationDetails(
      await errorsFor({ ...VALID, items: [{ name: 'ok' }, { name: 2 }] }),
    );
    expect(details).toEqual([{ field: 'items.1.name', messages: ['name must be a string'] }]);
  });

  it('nó sem constraints próprias não gera entrada vazia', () => {
    const tree: ValidationError[] = [
      {
        property: 'child',
        children: [{ property: 'name', constraints: { isString: 'name must be a string' } }],
      },
    ];
    expect(toValidationDetails(tree)).toEqual([
      { field: 'child.name', messages: ['name must be a string'] },
    ]);
  });
});
