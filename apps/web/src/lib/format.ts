// Formatação para exibição em pt-BR, no fuso do navegador (a API manda instantes em UTC).

const numberFormat = new Intl.NumberFormat('pt-BR');

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatCount(count: number, singular: string, plural: string): string {
  return `${numberFormat.format(count)} ${count === 1 ? singular : plural}`;
}
