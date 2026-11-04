import { useEffect, useRef, useState, type FormEvent } from 'react';
import { TextField } from '../../components/form-fields';
import { MAX_QUERY_LENGTH, SEARCH_DEBOUNCE_MS } from './list-params';

/**
 * Busca com debounce: o texto fica no estado do campo enquanto a pessoa digita e só vai
 * para a URL (e para a API) depois de 300 ms sem digitar, ou na hora com Enter.
 */
export function SearchField({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Último valor que este campo mandou para a URL. Serve para distinguir a volta do nosso
  // próprio commit (não mexe no campo) de uma mudança externa, como "voltar" no navegador ou
  // "Limpar filtros" (aí o campo passa a mostrar o valor da URL).
  const committed = useRef(value);
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    if (value === committed.current) return;
    clearTimeout(timer.current);
    committed.current = value;
    setText(value);
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function commit(next: string) {
    clearTimeout(timer.current);
    const q = next.trim();
    if (q === committed.current) return;
    committed.current = q;
    onSearchRef.current(q);
  }

  function handleChange(next: string) {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), SEARCH_DEBOUNCE_MS);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commit(text);
  }

  return (
    <form role="search" onSubmit={handleSubmit}>
      <TextField
        label="Buscar"
        type="search"
        placeholder="Título ou descrição"
        maxLength={MAX_QUERY_LENGTH}
        value={text}
        onChange={(event) => handleChange(event.target.value)}
      />
    </form>
  );
}
