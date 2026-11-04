import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** Estado de navegação com a mensagem de sucesso da tela anterior ("Ordem criada."). */
export type FlashState = { flash?: string };

/**
 * Lê a mensagem que veio na navegação e a tira do histórico, para não reaparecer ao
 * recarregar ou ao voltar. Também serve para avisos da própria tela (`setMessage`).
 */
export function useFlash() {
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = (location.state as FlashState | null)?.flash ?? null;
  const [message, setMessage] = useState<string | null>(incoming);

  // Mensagem nova numa navegação para a mesma tela (ex.: excluir e voltar para a lista).
  const [seen, setSeen] = useState(incoming);
  if (incoming !== null && incoming !== seen) {
    setSeen(incoming);
    setMessage(incoming);
  }

  useEffect(() => {
    if (incoming === null) return;
    // Mantém o resto do estado (ex.: a busca da lista para o "voltar").
    const { flash: _flash, ...rest } = (location.state ?? {}) as FlashState & object;
    void navigate(`${location.pathname}${location.search}`, { replace: true, state: rest });
  }, [incoming, location.pathname, location.search, location.state, navigate]);

  return { message, setMessage, dismiss: () => setMessage(null) };
}
