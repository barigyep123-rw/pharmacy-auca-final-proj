"use client";

import { useState } from "react";
import { pharmacyName, pharmacyPlace } from "@/lib/brand";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Notice } from "./ui/chrome";

export function RegisterScreen() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function register() {
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, phone, email, password }),
      });
      window.location.replace(new URL("/login?ready=1", window.location.origin).href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the admin account.");
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="flex flex-col justify-between bg-pine-deep px-6 py-8 text-paper-2 lg:px-12 lg:py-12">
        <div>
          <p className="font-serif text-3xl">{pharmacyName}</p>
          <p className="mt-1 text-sm text-paper-2/65">{pharmacyPlace}</p>
        </div>
        <div className="my-10 max-w-md">
          <h1 className="font-serif text-4xl leading-tight tracking-tight md:text-5xl">
            Open the ledger with the first admin account.
          </h1>
          <p className="mt-6 text-sm leading-6 text-paper-2/75">
            This desk has no admin yet. Register your name, phone, and email, then choose a password. After that, sign in with those details.
          </p>
        </div>
        <p className="text-xs text-paper-2/50">Prices in Rwandan francs. Dates follow Africa/Kigali.</p>
      </section>

      <section className="flex items-center bg-paper px-6 py-10 lg:px-12">
        <form
          className="mx-auto w-full max-w-md space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void register();
          }}
        >
          <div>
            <h2 className="font-serif text-3xl tracking-tight">Register the admin</h2>
            <p className="mt-2 text-sm text-muted">Only the first admin is created here. Later staff sign in at the counter.</p>
          </div>
          {error ? <Notice>{error}</Notice> : null}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Phone number</span>
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              inputMode="tel"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Password</span>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Repeat password</span>
            <Input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating the account…" : "Create admin account"}
          </Button>
        </form>
      </section>
    </div>
  );
}
