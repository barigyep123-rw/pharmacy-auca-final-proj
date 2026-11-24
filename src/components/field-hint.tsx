"use client";

import { useState } from "react";

export function FieldHint({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        className="ml-1 inline-flex size-4 items-center justify-center rounded-full border border-line text-[10px] font-semibold text-muted"
        onClick={() => setOpen((current) => !current)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        !
      </button>
      {open ? (
        <span className="absolute left-0 top-5 z-30 w-64 rounded-lg border border-line bg-paper p-2 text-xs font-normal text-ink shadow-sm">
          {text}
        </span>
      ) : null}
    </span>
  );
}
