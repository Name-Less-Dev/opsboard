import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { parseListParams, serializeListParams, type ListParams } from './list-params';

type SetListParams = (next: ListParams, options?: { replace?: boolean }) => void;

/**
 * Lê os filtros da URL e escreve na URL: não há estado próprio, então F5, colar a URL e
 * voltar/avançar no navegador reproduzem a mesma tela.
 */
export function useListParams(): [ListParams, SetListParams] {
  const location = useLocation();
  const navigate = useNavigate();

  const params = useMemo(
    () => parseListParams(new URLSearchParams(location.search)),
    [location.search],
  );

  const setParams = useCallback<SetListParams>(
    (next, options) => {
      const search = serializeListParams(next);
      // `navigate` com o texto pronto, e não `setSearchParams`: ele escaparia as vírgulas.
      void navigate({ search: search ? `?${search}` : '' }, { replace: options?.replace });
    },
    [navigate],
  );

  // URL fora da forma canônica (valor inválido, padrão escrito por extenso, outra ordem):
  // corrige com `replace`, para o "voltar" não cair de novo na URL inválida.
  useEffect(() => {
    if (location.search.replace(/^\?/, '') !== serializeListParams(params)) {
      setParams(params, { replace: true });
    }
  }, [location.search, params, setParams]);

  return [params, setParams];
}
