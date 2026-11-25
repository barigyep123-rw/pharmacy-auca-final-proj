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

export function Notice({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" }) {
  return (
    <p
      className={tone === "ok" ? "rounded-md bg-pine-soft px-3 py-2 text-sm text-pine" : "rounded-md bg-clay-soft px-3 py-2 text-sm text-clay"}
      role={tone === "ok" ? "status" : "alert"}
    >
      {children}
    </p>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted">{label}</p>
      <div className="h-20 animate-pulse rounded-xl bg-line/70" />
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
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-2xl">
        {eyebrow ? <p className="mb-1 text-xs font-medium text-muted">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {lede ? <p className="mt-1 text-sm leading-6 text-muted">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}
