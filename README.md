# Pharmacie Ubuzima

Counter ledger for a neighborhood pharmacy in Kimironko, Kigali. It keeps the drug catalog, records walk-in sales, files prescriptions, and tracks supplier orders. Sales and dispensing take stock off the shelf. A supplier order increases stock only when the delivery is received.

## Stack

- Next.js, React, and TypeScript
- Node route handlers for the API
- Embedded Postgres via PGlite for local runs, so there is no database server to install
- Postgres when `DATABASE_URL` is set (used by the published app)
- Tailwind for the interface

Admins can change selling prices and remove a drug that has no history. Pharmacists sell, dispense, place supplier orders, and receive them. Both roles share the same four screens.

## First visit

A fresh database has no staff accounts and no built-in passwords. The first page asks the initial admin to register a name, phone number, email, and password. After that, the sign-in page is the entry point. A second registration is refused.

The sample drug shelf is loaded with the database. Sales and prescriptions start empty until someone records them.

## Run it

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4781. Delete `data/` to see the registration page again.

```bash
npm test
npm run lint
```

Prices are in Rwandan francs. “Today” follows Africa/Kigali.
