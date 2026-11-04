// Bloco cinza no formato do conteúdo que vai chegar. É decorativo (aria-hidden): quem anuncia
// o carregamento é o contêiner, com texto para leitor de tela.
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-control bg-surface-muted ${className}`}
    />
  );
}
