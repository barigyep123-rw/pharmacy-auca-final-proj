"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Staff } from "@/lib/types";
import { SessionContext } from "./session";
import { Shell } from "./shell";
import { LoadingBlock } from "./ui/chrome";

export function SessionGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Staff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    api<{ user: Staff }>("/api/auth/me")
      .then((result) => {
        if (!cancel) setUser(result.user);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Sign in to continue.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <SessionContext.Provider value={user}>
      {user ? (
        <Shell user={user}>{children}</Shell>
      ) : (
        <div className="min-h-screen">
          <div className="mx-auto max-w-3xl px-4 py-16">
            {error ? <p className="text-sm text-clay">{error}</p> : <LoadingBlock label="Opening the ledger…" />}
          </div>
          <div hidden>{children}</div>
        </div>
      )}
    </SessionContext.Provider>
  );
}
