import { Link, useLocation, useParams } from 'react-router';

// Página provisória: o detalhe de verdade é do Dia 7. Existe só para o link da lista não
// levar a uma rota inexistente.
export function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const state = location.state as { listSearch?: string } | null;

  return (
    <main className="space-y-3">
      <h1 className="text-2xl font-semibold">Detalhe em construção</h1>
      <p className="text-muted">
        Ordem <code className="break-all">{id}</code>
      </p>
      <Link
        to={`/orders${state?.listSearch ?? ''}`}
        className="inline-block font-medium text-primary underline-offset-2 hover:underline"
      >
        Voltar para a lista
      </Link>
    </main>
  );
}
