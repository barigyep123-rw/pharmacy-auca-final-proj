"use client";

import { useState } from "react";

export type SelectOption = { value: string; label: string };

export function SearchableSelect({
  value,
  onChange,
  options,
  name,
  placeholder = "Choose",
  ariaLabel,
}: {
  value: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? options.filter((option) => option.label.toLowerCase().startsWith(needle))
    : options;

  return (
    <div className="relative">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between rounded-md border border-line bg-paper-2 px-2 text-left text-sm"
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
        }}
      >
        <span className={selected ? "" : "text-muted"}>{selected?.label || placeholder}</span>
        <span className="text-muted" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-line bg-paper p-2">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-md border border-line bg-paper-2 px-2 text-sm"
          />
          <ul className="mt-1 max-h-48 overflow-y-auto">
            {filtered.length === 0 ? <li className="px-2 py-1.5 text-sm text-muted">Nothing starts with that.</li> : null}
            {filtered.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-card"
                  onClick={() => {
                    onChange?.(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
