// Skeleton screens: percepcao de ~30% mais rapido que spinner em listas
// (pesquisa UX). Mesma estrutura/altura do card real para nao dar layout shift.

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-spark-surface ${className}`} />;
}

// Card generico no formato dos cards de cliente/consulta/laudo.
export function SkeletonCard() {
  return (
    <li className="animate-pulse rounded-2xl border border-spark-line bg-spark-panel p-4">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 shrink-0 rounded-full bg-spark-surface" />
        <div className="min-w-0 flex-1">
          <div className="mb-2 h-4 w-2/3 rounded bg-spark-surface" />
          <div className="h-3 w-1/2 rounded bg-spark-surface" />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-7 w-28 rounded-full bg-spark-surface" />
        <div className="h-7 w-24 rounded-full bg-spark-surface" />
      </div>
    </li>
  );
}

export function SkeletonList({ n = 4 }: { n?: number }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Carregando" aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </ul>
  );
}
