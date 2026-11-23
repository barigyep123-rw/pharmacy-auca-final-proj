"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";

type Choice =
  | { kind: "supplier"; name: string }
  | { kind: "create"; name: string };

export function mergeSupplierNames(names: string[]) {
  const byKey = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, trimmed);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function SupplierField({
  label,
  value,
  suppliers,
  canCreate,
  required = false,
  onChange,
  onCreated,
}: {
  label: string;
  value: string;
  suppliers: string[];
  canCreate: boolean;
  required?: boolean;
  onChange: (value: string) => void;
  onCreated: (name: string) => void;
}) {
  const inputId = useId();
  const listId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needle = value.trim().replace(/\s+/g, " ");
  const needleKey = needle.toLowerCase();
  const matches = suppliers.filter((name) => needleKey === "" || name.toLowerCase().includes(needleKey));
  const exact = needleKey !== "" && suppliers.some((name) => name.toLowerCase() === needleKey);
  const choices: Choice[] = matches.map((name) => ({ kind: "supplier", name }));
  if (canCreate && needle.length >= 2 && !exact) choices.push({ kind: "create", name: needle });
  const current = Math.min(active, Math.max(choices.length - 1, 0));

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const anchorRect = anchor.getBoundingClientRect();
    let clipTop = 0;
    let clipBottom = window.innerHeight;
    let node = anchor.parentElement;
    while (node) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll" || overflow === "hidden") {
        const bounds = node.getBoundingClientRect();
        clipTop = bounds.top;
        clipBottom = bounds.bottom;
        break;
      }
      node = node.parentElement;
    }
    const spaceBelow = clipBottom - anchorRect.bottom;
    const spaceAbove = anchorRect.top - clipTop;
    const above = spaceBelow < 160 && spaceAbove > spaceBelow;
    menu.style.top = above ? "auto" : "100%";
    menu.style.bottom = above ? "100%" : "auto";
    menu.style.marginTop = above ? "0" : "4px";
    menu.style.marginBottom = above ? "4px" : "0";
    menu.dataset.placement = above ? "above" : "below";
  }, [open, needle, choices.length]);

  function choose(name: string) {
    onChange(name);
    setError(null);
    setOpen(false);
  }

  async function create(name: string) {
    setSaving(true);
    setError(null);
    try {
      const result = await api<{ supplier: { name: string } }>("/api/suppliers", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      onCreated(result.supplier.name);
      onChange(result.supplier.name);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that supplier.");
    } finally {
      setSaving(false);
    }
  }

  function activate(choice: Choice | undefined) {
    if (!choice || saving) return;
    if (choice.kind === "supplier") choose(choice.name);
    else void create(choice.name);
  }

  return (
    <div className={cn("space-y-1.5", open && "relative z-20")}>
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <div ref={anchorRef} className="relative">
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && choices[current] ? `${listId}-${current}` : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required={required}
          placeholder="Search suppliers"
          value={value}
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(0);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (!open) return;
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              return;
            }
            if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              setOpen(true);
              return;
            }
            if (!open) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive(Math.min(current + 1, Math.max(choices.length - 1, 0)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive(Math.max(current - 1, 0));
              return;
            }
            if (event.key === "Enter" && choices[current]) {
              event.preventDefault();
              activate(choices[current]);
            }
          }}
        />
        {open ? (
          <div
            ref={menuRef}
            data-supplier-menu
            data-placement="below"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-line bg-card py-1 shadow-lg"
            onMouseDown={(event) => event.preventDefault()}
          >
            {choices.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">
                {needle.length === 0
                  ? "No suppliers yet."
                  : canCreate
                    ? "Keep typing to add a supplier."
                    : "No matching suppliers."}
              </p>
            ) : (
              <ul id={listId} role="listbox" aria-label={label} className="text-sm">
                {choices.map((choice, index) => (
                  <li key={choice.kind === "create" ? `create:${choice.name}` : choice.name}>
                    <button
                      id={`${listId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === current}
                      disabled={saving}
                      className={cn(
                        "flex w-full px-3 py-2 text-left",
                        choice.kind === "create" && matches.length > 0 && "border-t border-line",
                        index === current ? "bg-pine-soft" : "hover:bg-paper",
                        choice.kind === "create" && "font-medium text-pine",
                      )}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => activate(choice)}
                    >
                      {choice.kind === "create"
                        ? saving
                          ? "Saving supplier…"
                          : `Add "${choice.name}"`
                        : choice.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
    </div>
  );
}
