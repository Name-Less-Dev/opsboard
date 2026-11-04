import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { formatCount } from '../lib/format';
import { Pagination } from './Pagination';

function renderPagination(page: number, totalPages: number, total = totalPages * 20) {
  const onPageChange = vi.fn();
  const view = render(
    <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} />,
  );
  return { onPageChange, ...view };
}

const button = (name: string) => screen.getByRole('button', { name });

describe('Pagination', () => {
  it('mostra "Página X de Y" e o total, com milhar em pt-BR', () => {
    renderPagination(3, 251, 5010);
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent(
      'Página 3 de 251 · 5.010 resultados',
    );
  });

  it('não aparece sem resultados', () => {
    const { container } = renderPagination(1, 0, 0);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['primeira página', 1, 5, { Primeira: true, Anterior: true, Próxima: false, Última: false }],
    ['página do meio', 3, 5, { Primeira: false, Anterior: false, Próxima: false, Última: false }],
    ['última página', 5, 5, { Primeira: false, Anterior: false, Próxima: true, Última: true }],
    ['página única', 1, 1, { Primeira: true, Anterior: true, Próxima: true, Última: true }],
  ])('%s: botões desabilitados nas pontas', (_name, page, totalPages, disabled) => {
    renderPagination(page, totalPages);
    for (const [name, isDisabled] of Object.entries(disabled)) {
      expect(button(name).hasAttribute('disabled')).toBe(isDisabled);
    }
  });

  it.each([
    ['Primeira', 1],
    ['Anterior', 2],
    ['Próxima', 4],
    ['Última', 5],
  ])('%s vai para a página %i', async (name, expected) => {
    const { onPageChange } = renderPagination(3, 5);
    await userEvent.click(button(name));
    expect(onPageChange).toHaveBeenCalledWith(expected);
  });

  it('desabilitada (carregando), nenhum botão responde', () => {
    render(<Pagination page={3} totalPages={5} total={100} onPageChange={vi.fn()} disabled />);
    for (const name of ['Primeira', 'Anterior', 'Próxima', 'Última']) {
      expect(button(name)).toBeDisabled();
    }
  });

  it.each([
    [0, '0 resultados'],
    [1, '1 resultado'],
    [2, '2 resultados'],
    [1234, '1.234 resultados'],
  ])('formatCount(%i) = %s', (count, expected) => {
    expect(formatCount(count, 'resultado', 'resultados')).toBe(expected);
  });
});
