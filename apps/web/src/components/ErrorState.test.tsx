import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { DEFAULT_ERROR_MESSAGE, ERROR_MESSAGES } from '../lib/error-messages';
import { ErrorState } from './ErrorState';

const REQUEST_ID = '0b6d2a4e-3f1c-4d9a-8e7b-5c2f1a0d9e8b';
const apiError = (statusCode: number, code: string) =>
  new ApiError({ statusCode, code, message: 'texto cru da API', requestId: REQUEST_ID });

describe('ErrorState', () => {
  it('mostra a mensagem pelo code, nunca o texto da API', () => {
    render(<ErrorState error={apiError(503, 'SERVICE_UNAVAILABLE')} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR_MESSAGES.SERVICE_UNAVAILABLE);
    expect(screen.queryByText(/texto cru/)).not.toBeInTheDocument();
  });

  it('erro inesperado (500) mostra o requestId para o suporte', () => {
    render(<ErrorState error={apiError(500, 'INTERNAL_ERROR')} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR_MESSAGES.INTERNAL_ERROR);
    expect(screen.getByText(REQUEST_ID)).toBeInTheDocument();
  });

  it.each([
    ['falha de rede', apiError(0, 'NETWORK_ERROR')],
    ['validação', apiError(400, 'VALIDATION_ERROR')],
    ['banco fora', apiError(503, 'SERVICE_UNAVAILABLE')],
  ])('erro esperado (%s) não mostra o requestId', (_name, error) => {
    render(<ErrorState error={error} onRetry={vi.fn()} />);
    expect(screen.queryByText(REQUEST_ID)).not.toBeInTheDocument();
  });

  it('código desconhecido: texto padrão e requestId', () => {
    render(<ErrorState error={apiError(418, 'TEAPOT')} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(DEFAULT_ERROR_MESSAGE);
    expect(screen.getByText(REQUEST_ID)).toBeInTheDocument();
  });

  it('"Tentar de novo" chama onRetry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={apiError(0, 'NETWORK_ERROR')} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('enquanto tenta de novo, o botão fica desabilitado', () => {
    render(<ErrorState error={apiError(0, 'NETWORK_ERROR')} onRetry={vi.fn()} retrying />);
    expect(screen.getByRole('button', { name: 'Tentando…' })).toBeDisabled();
  });
});
