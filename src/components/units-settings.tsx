"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";
import { SearchableSelect } from "./searchable-select";

type Unit = { id: number; kind: "base" | "pack"; name: string };

export function UnitsSettings() {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"base" | "pack">("base");
  const [name, setName] = useState("");

  useEffect(() => {
    let cancel = false;
    api<{ units: Unit[] }>("/api/catalog-units")
      .then((result) => {
        if (!cancel) setUnits(result.units);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load units.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (!units && !error) return <LoadingBlock label="Opening units…" />;
  if (!units) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Units"
        lede="Base units and packs used when a drug is added. The add-drug form picks from this list."
      />
      <Card className="mb-4 p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void api<{ units: Unit[] }>("/api/catalog-units", {
              method: "POST",
              body: JSON.stringify({ kind, name }),
            })
              .then((result) => {
                setUnits(result.units);
                setName("");
                toast.success("Unit added.");
              })
              .catch((caught: unknown) => toast.error(caught instanceof Error ? caught.message : "Could not add that unit."));
          }}
        >
          <label className="w-40 space-y-1.5 text-sm">
            Kind
            <SearchableSelect
              value={kind}
              onChange={(value) => setKind(value === "pack" ? "pack" : "base")}
              options={[
                { value: "base", label: "Base unit" },
                { value: "pack", label: "Pack" },
              ]}
            />
          </label>
          <label className="space-y-1.5 text-sm">
            Name
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="blister" required />
          </label>
          <Button type="submit">Add unit</Button>
        </form>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {(["base", "pack"] as const).map((group) => (
          <Card key={group} className="p-4">
            <h2 className="font-semibold text-xl">{group === "base" ? "Base units" : "Packs"}</h2>
            <ul className="mt-3 divide-y divide-line text-sm">
              {units.filter((unit) => unit.kind === group).map((unit) => (
                <li key={unit.id} className="flex items-center justify-between py-2">
                  <span>{unit.name}</span>
                  <button
                    type="button"
                    className="text-muted hover:text-ink"
                    onClick={() => {
                      void api<{ units: Unit[] }>(`/api/catalog-units?id=${unit.id}`, { method: "DELETE" })
                        .then((result) => setUnits(result.units))
                        .catch((caught: unknown) => toast.error(caught instanceof Error ? caught.message : "Could not remove that unit."));
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
