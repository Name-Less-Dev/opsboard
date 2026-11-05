import { neutralizeCell } from './neutralize-cell';

describe('neutralizeCell', () => {
  it.each([
    ['=HYPERLINK("x")', `'=HYPERLINK("x")`],
    ['+1+1', `'+1+1`],
    ['-2+3', `'-2+3`],
    ['@SUM(A1)', `'@SUM(A1)`],
    ['\tcmd', `'\tcmd`],
    ['\rcmd', `'\rcmd`],
  ])('neutraliza %j', (input, expected) => {
    expect(neutralizeCell(input)).toBe(expected);
  });

  it.each([
    ['  =1+1', `'  =1+1`],
    [' @x', `' @x`],
  ])('neutraliza %j mesmo com espaços antes, sem tirar os espaços', (input, expected) => {
    expect(neutralizeCell(input)).toBe(expected);
  });

  it.each([
    'Trocar filtro',
    'Ana Operadora',
    'a=b',
    'custo: -5',
    "'já com apóstrofo",
    'Média',
    'linha 1\nlinha 2',
  ])('mantém texto normal intacto: %j', (input) => {
    expect(neutralizeCell(input)).toBe(input);
  });

  it.each([
    ['', ''],
    [null, ''],
    [undefined, ''],
    ['   ', '   '],
  ])('vazio %j vira %j', (input, expected) => {
    expect(neutralizeCell(input)).toBe(expected);
  });

  it.each([
    [42, '42'],
    [-5, '-5'],
    [0, '0'],
  ])('número %j sai como está', (input, expected) => {
    expect(neutralizeCell(input)).toBe(expected);
  });
});
