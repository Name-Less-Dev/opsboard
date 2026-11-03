import { parseCorsOrigins } from './configure-app';

describe('parseCorsOrigins', () => {
  it.each([
    ['ausente', undefined, []],
    ['vazio', '', []],
    ['só espaços e vírgulas', ' , ,', []],
    ['uma origem', 'https://ops.example.com', ['https://ops.example.com']],
    [
      'várias, com espaços',
      ' https://a.example.com ,https://b.example.com ',
      ['https://a.example.com', 'https://b.example.com'],
    ],
  ])('%s', (_name, value, expected) => {
    expect(parseCorsOrigins(value)).toEqual(expected);
  });
});
