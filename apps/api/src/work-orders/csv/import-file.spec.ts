import {
  decodeUtf8Strict,
  detectDelimiter,
  parseImportFile,
  validateHeader,
  type FileResult,
} from './import-file';

const utf8 = (text: string) => new TextEncoder().encode(text);
const BOM = '﻿';

function failure<T>(result: FileResult<T>): string {
  if (result.ok) throw new Error('esperava falha');
  return result.message;
}

describe('decodeUtf8Strict', () => {
  it.each([
    ['ASCII', 'title;priority', 'title;priority'],
    ['acentos', 'Manutenção;Média', 'Manutenção;Média'],
    ['com BOM, que é removido', `${BOM}título`, 'título'],
  ])('aceita %s', (_label, input, expected) => {
    expect(decodeUtf8Strict(utf8(input))).toEqual({ ok: true, value: expected });
  });

  it('recusa Latin-1 com a dica de salvar como UTF-8', () => {
    // "Média" em Latin-1: o é vira 0xE9, que sozinho não é UTF-8 válido.
    const latin1 = Uint8Array.from([0x4d, 0xe9, 0x64, 0x69, 0x61]);
    expect(failure(decodeUtf8Strict(latin1))).toMatch(/UTF-8/);
  });
});

describe('detectDelimiter', () => {
  it.each([
    ['title;priority;dueDate', ';'],
    ['title,priority,dueDate', ','],
    ['title;priority,dueDate;x', ';'],
    ['title,priority;dueDate,x', ','],
    ['title', ';'],
    ['', ';'],
  ] as const)('%j → %j', (line, expected) => {
    expect(detectDelimiter(line)).toBe(expected);
  });
});

describe('validateHeader', () => {
  it('aceita todas as colunas, em qualquer ordem', () => {
    expect(
      validateHeader(['priority', 'assigneeEmail', 'title', 'dueDate', 'description']),
    ).toEqual({
      ok: true,
      value: ['priority', 'assigneeEmail', 'title', 'dueDate', 'description'],
    });
  });

  it.each([
    [
      ['TITLE', 'Priority'],
      ['title', 'priority'],
    ],
    [
      ['  title ', ' priority', 'ASSIGNEEEMAIL'],
      ['title', 'priority', 'assigneeEmail'],
    ],
  ])('ignora maiúsculas e espaços: %j', (cells, expected) => {
    expect(validateHeader(cells)).toEqual({ ok: true, value: expected });
  });

  it.each([
    [['priority'], /obrigatórias.*title/],
    [['title'], /obrigatórias.*priority/],
    [['description', 'dueDate'], /title, priority/],
  ])('recusa coluna obrigatória faltando: %j', (cells, message) => {
    expect(failure(validateHeader(cells))).toMatch(message);
  });

  it('recusa coluna desconhecida, citando o nome', () => {
    expect(failure(validateHeader(['title', 'priority', 'status']))).toMatch(
      /desconhecida.*"status"/,
    );
  });

  it('recusa coluna sem nome', () => {
    expect(failure(validateHeader(['title', 'priority', '']))).toMatch(/sem nome/);
  });

  it.each([[['title', 'priority', 'title']], [['title', 'priority', 'PRIORITY']]])(
    'recusa coluna repetida: %j',
    (cells) => {
      expect(failure(validateHeader(cells))).toMatch(/mais de uma vez/);
    },
  );
});

describe('parseImportFile', () => {
  it('lê registros com `;`, numerando a partir da linha 2', () => {
    const result = parseImportFile(utf8('title;priority\r\nA b c;HIGH\r\nD e f;Baixa\r\n'), 500);
    expect(result).toEqual({
      ok: true,
      value: [
        { rowNumber: 2, values: { title: 'A b c', priority: 'HIGH' } },
        { rowNumber: 3, values: { title: 'D e f', priority: 'Baixa' } },
      ],
    });
  });

  it('aceita `,`, LF e BOM', () => {
    const result = parseImportFile(utf8(`${BOM}title,priority\nA b c,LOW\n`), 500);
    expect(result).toEqual({
      ok: true,
      value: [{ rowNumber: 2, values: { title: 'A b c', priority: 'LOW' } }],
    });
  });

  it('respeita aspas com separador e quebra de linha dentro', () => {
    const result = parseImportFile(utf8('title;description;priority\n"A; b";"l1\nl2";LOW\n'), 500);
    expect(result).toEqual({
      ok: true,
      value: [{ rowNumber: 2, values: { title: 'A; b', description: 'l1\nl2', priority: 'LOW' } }],
    });
  });

  it('ignora linhas vazias, mas elas contam na numeração', () => {
    const result = parseImportFile(utf8('title;priority\n\nA b c;LOW\n;\n\nD e f;LOW\n\n'), 500);
    expect(result.ok && result.value.map((record) => record.rowNumber)).toEqual([3, 6]);
  });

  it.each([
    ['vazio', '', /vazio/],
    ['só espaços e quebras', ' \r\n\n', /vazio/],
    ['só cabeçalho', 'title;priority\r\n', /só tem o cabeçalho/],
    ['coluna desconhecida', 'title;priority;foo\nA b c;LOW;x', /desconhecida/],
    ['aspas abertas', 'title;priority\n"A b c;LOW\n', /malformado/],
    ['colunas a mais na linha', 'title;priority\nA;LOW;extra\n', /linha 2 tem 3 colunas/],
    ['colunas a menos na linha', 'title;priority\nA b c\n', /linha 2 tem 1 colunas/],
  ])('recusa arquivo %s', (_label, text, message) => {
    expect(failure(parseImportFile(utf8(text), 500))).toMatch(message);
  });

  it('recusa Latin-1', () => {
    const bytes = Uint8Array.from([...utf8('title;priority\nM'), 0xe9, ...utf8('dia;LOW\n')]);
    expect(failure(parseImportFile(bytes, 500))).toMatch(/UTF-8/);
  });

  it('aceita exatamente o máximo de linhas e recusa uma a mais', () => {
    const file = (rows: number) =>
      utf8(['title;priority', ...Array.from({ length: rows }, () => 'Abc;LOW')].join('\n'));
    expect(parseImportFile(file(3), 3).ok).toBe(true);
    expect(failure(parseImportFile(file(4), 3))).toMatch(/mais de 3 ordens/);
  });
});
