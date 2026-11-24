"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Node = {
  id: number;
  name: string;
  description: string;
  subcategories: Array<{ id: number; name: string; description: string }>;
};

export function CategoriesScreen() {
  const [rows, setRows] = useState<Node[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subName, setSubName] = useState<Record<number, string>>({});

  async function load() {
    const result = await api<{ categories: Node[] }>("/api/categories");
    setRows(result.categories);
  }

  useEffect(() => {
    let cancel = false;
    api<{ categories: Node[] }>("/api/categories")
      .then((result) => {
        if (!cancel) setRows(result.categories);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load categories.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/api/categories", { method: "POST", body: JSON.stringify({ name, description }) });
      setName("");
      setDescription("");
      toast.success("Category added.");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not add that category.");
    }
  }

  async function addSub(categoryId: number) {
    const value = (subName[categoryId] ?? "").trim();
    if (value.length < 2) return;
    try {
      await api(`/api/categories/${categoryId}/subcategories`, {
        method: "POST",
        body: JSON.stringify({ name: value, description: "" }),
      });
      setSubName((current) => ({ ...current, [categoryId]: "" }));
      toast.success("Subcategory added.");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not add that subcategory.");
    }
  }

  async function removeCategory(id: number) {
    try {
      await api(`/api/categories/${id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not remove that category.");
    }
  }

  async function removeSub(id: number) {
    try {
      await api(`/api/subcategories/${id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not remove that subcategory.");
    }
  }

  if (!rows && !error) return <LoadingBlock label="Opening categories…" />;
  if (!rows) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Categories"
        lede="A category groups the shelf, the counter, and reorder drafts. A subcategory sits under one category. Drugs pick one of each."
      />
      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void addCategory(event)}>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">New category</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="min-w-64 flex-1 space-y-1.5">
            <span className="text-sm font-medium">Description</span>
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <Button type="submit">Add category</Button>
        </form>
      </Card>
      <div className="space-y-3">
        {rows.map((category) => (
          <Card key={category.id} className="p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{category.name}</p>
                {category.description ? <p className="text-sm text-muted">{category.description}</p> : null}
              </div>
              <Button variant="quiet" size="sm" onClick={() => void removeCategory(category.id)}>Remove</Button>
            </div>
            <ul className="mb-3 space-y-1 text-sm">
              {category.subcategories.map((sub) => (
                <li key={sub.id} className="flex items-center justify-between gap-2">
                  <span>{sub.name}</span>
                  <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => void removeSub(sub.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={subName[category.id] ?? ""}
                placeholder="Subcategory"
                onChange={(event) => setSubName((current) => ({ ...current, [category.id]: event.target.value }))}
              />
              <Button variant="quiet" onClick={() => void addSub(category.id)}>Add</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
