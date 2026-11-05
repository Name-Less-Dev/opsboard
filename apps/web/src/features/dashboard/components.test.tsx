import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeOrder } from '../../test/api-mock';
import { DistributionBar } from './DistributionBar';
import { OverdueCard } from './OverdueCard';
import { OverdueList } from './OverdueList';
import { StatusCard } from './StatusCard';
import { summarizeStatus } from './summary';

const inRouter = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('componentes do painel', () => {
  it('StatusCard: nome acessível completo, singular e plural', () => {
    inRouter(
      <>
        <StatusCard status="OPEN" count={5} href="/orders?status=OPEN" />
        <StatusCard status="DONE" count={1} href="/orders?status=DONE" />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Abertas: 5 ordens, ver lista' })).toHaveAttribute(
      'href',
      '/orders?status=OPEN',
    );
    expect(screen.getByRole('link', { name: 'Concluídas: 1 ordem, ver lista' })).toBeVisible();
  });

  it('OverdueCard: texto "Atrasadas" e número, não só cor', () => {
    inRouter(<OverdueCard count={1234} href="/orders?overdue=true" />);
    const link = screen.getByRole('link', { name: 'Atrasadas: 1.234 ordens, ver lista' });
    expect(link).toHaveTextContent('Atrasadas');
    expect(link).toHaveTextContent('1.234');
  });

  it('DistributionBar: descreve os números e repete em tabela', () => {
    const counts = { OPEN: 5, IN_PROGRESS: 2, DONE: 2, CANCELLED: 1 };
    render(<DistributionBar counts={counts} summary={summarizeStatus(counts)} />);
    expect(
      screen.getByRole('img', {
        name: 'Distribuição das 10 ordens por status: Abertas 5 (50%), Em andamento 2 (20%), Concluídas 2 (20%), Canceladas 1 (10%)',
      }),
    ).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Em andamento/ });
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['2', '20%']);
  });

  it('DistributionBar: segmento com 0 não aparece; total 0 não renderiza nada', () => {
    const counts = { OPEN: 3, IN_PROGRESS: 0, DONE: 1, CANCELLED: 0 };
    const { container, rerender } = render(
      <DistributionBar counts={counts} summary={summarizeStatus(counts)} />,
    );
    expect(screen.getByRole('img').children).toHaveLength(2);

    const zero = { OPEN: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 };
    rerender(<DistributionBar counts={zero} summary={summarizeStatus(zero)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('OverdueList: mantém a ordem recebida e calcula o atraso com o `now` dado', () => {
    const now = new Date('2026-11-05T12:00:00.000Z');
    const orders = [
      makeOrder({ title: 'Mais antiga', dueDate: '2026-11-01T12:00:00.000Z' }),
      makeOrder({ title: 'Mais nova', dueDate: '2026-11-05T09:00:00.000Z', assignee: null }),
    ];
    inRouter(<OverdueList orders={orders} now={now} />);

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('link').textContent)).toEqual([
      'Mais antiga',
      'Mais nova',
    ]);
    expect(rows[0]).toHaveTextContent('há 4 dias');
    expect(rows[1]).toHaveTextContent('há 3 horas');
    expect(rows[1]).toHaveTextContent('Sem responsável');
  });
});
