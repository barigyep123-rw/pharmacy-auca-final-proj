"use client";

import { useState } from "react";
import { pharmacyName, pharmacyPlace } from "@/lib/brand";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Notice } from "./ui/chrome";

export function LoginScreen({ notice }: { notice?: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setError(null);
    setPending(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      window.location.replace(new URL("/dashboard", window.location.origin).href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,24rem)_1fr]">
      <section className="order-2 hidden flex-col justify-between border-r border-line bg-paper-2 px-8 pt-10 pb-16 lg:order-1 lg:flex">
        <p className="text-lg font-semibold">{pharmacyName}</p>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock, sales, and prescriptions.</h1>
          <p className="mt-2 text-sm text-muted">{pharmacyPlace}</p>
        </div>
        <p className="text-xs text-muted">Prices in Rwandan francs. Dates follow Africa/Kigali.</p>
      </section>

      <section className="order-1 flex items-start bg-paper px-6 py-8 lg:order-2 lg:items-center lg:px-12 lg:py-10">
        <form
          className="mx-auto w-full max-w-md space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          <div>
            <p className="mb-3 text-sm font-semibold lg:hidden">{pharmacyName}</p>
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-2 text-sm text-muted">
              Use the email and password for your desk. Admin and pharmacist see different catalog controls.
            </p>
          </div>
          {notice ? <Notice tone="ok">{notice}</Notice> : null}
          {error ? <Notice>{error}</Notice> : null}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Email</span>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Password</span>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Checking…" : "Enter the counter"}
          </Button>
        </form>
      </section>
    </div>
  );
}
