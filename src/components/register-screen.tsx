"use client";

import { useState } from "react";
import { roleLabel } from "@/lib/access";
import { pharmacyName, pharmacyPlace } from "@/lib/brand";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Notice } from "./ui/chrome";
import type { Role } from "@/lib/types";

type DemoLogin = { name: string; email: string; role: Role; password: string };

export function RegisterScreen() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [demoStaff, setDemoStaff] = useState<DemoLogin[] | null>(null);

  async function register() {
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await api<{ demoStaff: DemoLogin[] }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, phone, email, password }),
      });
      setDemoStaff(result.demoStaff);
      setPending(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the admin account.");
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,24rem)_1fr]">
      <section className="order-2 hidden flex-col justify-between border-r border-line bg-paper-2 px-8 pt-10 pb-16 lg:order-1 lg:flex">
        <p className="text-lg font-semibold">{pharmacyName}</p>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Register the first admin.</h1>
          <p className="mt-2 text-sm text-muted">{pharmacyPlace}</p>
        </div>
        <p className="text-xs text-muted">Prices in Rwandan francs. Dates follow Africa/Kigali.</p>
      </section>

      <section className="order-1 flex items-start bg-paper px-6 py-8 lg:order-2 lg:items-center lg:px-12 lg:py-10">
        {demoStaff ? (
          <div className="mx-auto w-full max-w-md space-y-5">
            <div>
              <p className="mb-3 text-sm font-semibold lg:hidden">{pharmacyName}</p>
              <h2 className="text-2xl font-semibold tracking-tight">Desk passwords</h2>
              <p className="mt-2 text-sm text-muted">
                These example accounts were created just now. The passwords are shown once and are not stored in the app.
              </p>
            </div>
            <ul className="space-y-3">
              {demoStaff.map((person) => (
                <li key={person.email} className="rounded-xl border border-line bg-card px-3 py-3">
                  <p className="text-sm font-medium">{person.name}</p>
                  <p className="text-xs text-brass">{roleLabel(person.role)}</p>
                  <p className="mt-1 text-sm">{person.email}</p>
                  <p className="mt-1 font-mono text-sm">{person.password}</p>
                </li>
              ))}
            </ul>
            <Button type="button" className="w-full" onClick={() => window.location.replace(new URL("/login?ready=1", window.location.origin).href)}>
              Continue to sign in
            </Button>
          </div>
        ) : (
        <form
          className="mx-auto w-full max-w-md space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void register();
          }}
        >
          <div>
            <p className="mb-3 text-sm font-semibold lg:hidden">{pharmacyName}</p>
            <h2 className="text-2xl font-semibold tracking-tight">Register the admin</h2>
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
        )}
      </section>
    </div>
  );
}
