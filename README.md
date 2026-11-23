# Apotheka

Counter ledger for a neighborhood pharmacy in Kigali. It keeps the drug catalog, records walk-in sales, files prescriptions, and tracks supplier orders. Sales and dispensing take stock off the shelf. A supplier order increases stock only when the delivery is marked received.

## Stack

- Next.js, React, and TypeScript
- Node route handlers for the API
- Embedded Postgres via PGlite for local runs, so there is no database server to install
- Postgres when `DATABASE_URL` is set (used by the published app)
- Tailwind for the interface

Sample staff accounts are created the first time the database is empty.

| Name | Role | Email | Password |
| --- | --- | --- | --- |
| Amina Uwase | Admin | amina@apotheka.rw | pine-ledger |
| Jean Habimana | Pharmacist | jean@apotheka.rw | counter-key |

Admins can change selling prices and remove a drug that has no history. Pharmacists sell, dispense, place supplier orders, and receive them. Both roles share the same four screens.

## Run it

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4781 and sign in with either sample account. The sign-in screen can fill those accounts for you.

```bash
npm test
npm run lint
```

Local data lives in `data/pglite`. Delete that folder to load the sample shelf again.

Prices are in Rwandan francs. “Today” follows Africa/Kigali.
