export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-5 text-muted">{hint}</span> : null}
    </label>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay" role="alert">
      {children}
    </p>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted">{label}</p>
      <div className="h-28 animate-pulse rounded-2xl bg-line/80" />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  action,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-brass">{eyebrow}</p>
        ) : null}
        <h1 className="font-serif text-3xl tracking-tight md:text-4xl">{title}</h1>
        {lede ? <p className="mt-2 text-sm leading-6 text-muted">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}
