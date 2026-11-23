"use client";

import { useState } from "react";
import { pharmacyName, pharmacyPlace } from "@/lib/brand";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Notice } from "./ui/chrome";

export function LoginScreen() {
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
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="flex flex-col justify-between bg-pine-deep px-6 py-8 text-paper-2 lg:px-12 lg:py-12">
        <div>
          <p className="font-serif text-3xl">{pharmacyName}</p>
          <p className="mt-1 text-sm text-paper-2/65">{pharmacyPlace}</p>
        </div>
        <div className="my-10 max-w-md">
          <h1 className="font-serif text-4xl leading-tight tracking-tight md:text-5xl">
            The shelf, the counter, and the prescriptions in one ledger.
          </h1>
          <ul className="mt-6 space-y-2 text-sm leading-6 text-paper-2/75">
            <li>Stock, expiry, and low-shelf alerts.</li>
            <li>Walk-in sales that take quantity off the shelf.</li>
            <li>Prescriptions you can mark dispensed.</li>
            <li>Supplier orders that add stock only when the delivery is received.</li>
          </ul>
        </div>
        <p className="text-xs text-paper-2/50">Prices in Rwandan francs. Dates follow Africa/Kigali.</p>
      </section>

      <section className="flex items-center bg-paper px-6 py-10 lg:px-12">
        <form
          className="mx-auto w-full max-w-md space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          <div>
            <h2 className="font-serif text-3xl tracking-tight">Sign in</h2>
            <p className="mt-2 text-sm text-muted">
              Use the email and password issued for your desk. Admin and pharmacist see different catalog controls.
            </p>
          </div>
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
