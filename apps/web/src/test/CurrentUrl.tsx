import { useLocation } from 'react-router';

/** Mostra a URL atual do roteador, para os testes conferirem a navegação. */
export function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="url">{`${location.pathname}${location.search}`}</output>;
}
