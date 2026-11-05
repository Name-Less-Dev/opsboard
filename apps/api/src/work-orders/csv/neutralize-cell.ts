// Planilhas executam como fórmula a célula que começa com `=`, `+`, `-` ou `@` (e tab/CR
// também abrem brecha). Um `'` na frente faz o Excel e o LibreOffice mostrarem o texto como
// texto. Só os espaços comuns iniciais são ignorados na checagem; o valor sai com eles intactos.
const FORMULA_START = /^ *[=+\-@\t\r]/;

/** Valor pronto para uma célula do CSV exportado. Números saem como estão (não são texto livre). */
export function neutralizeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  return FORMULA_START.test(value) ? `'${value}` : value;
}
