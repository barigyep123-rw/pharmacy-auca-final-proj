# Pharmacie Ubuzima

Counter ledger for a neighborhood pharmacy in Kimironko, Kigali. It keeps the drug catalog, records walk-in sales, files prescriptions, and tracks supplier orders. Sales and dispensing take stock off the shelf. A supplier order increases stock only when the delivery is received.

## Stack

- Next.js, React, and TypeScript
- Node route handlers for the API
- Embedded Postgres via PGlite for local runs, so there is no database server to install
- Postgres when `DATABASE_URL` is set (used by the published app)
- Tailwind for the interface

Admins can change selling prices and remove a drug that has no history. Pharmacists sell, dispense, place supplier orders, and receive them. Both roles share the same four screens.

## Staff passwords

The app does not ship with passwords.

On a hosted database, sample staff are created only when both of these are set:

- `UBUZIMA_ADMIN_PASSWORD` for Amina Uwase (`amina@ubuzima.rw`)
- `UBUZIMA_PHARMACIST_PASSWORD` for Jean Habimana (`jean@ubuzima.rw`)

Leave either one unset and the empty database stays empty. No default password is inserted.

For a local run, the first start writes a random password for each of those desks to `data/staff-passwords.txt`. That file is gitignored. Delete `data/` to load a fresh shelf and a new pair of passwords.

## Run it

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4781 and sign in with the emails and passwords in `data/staff-passwords.txt`.

```bash
npm test
npm run lint
```

Prices are in Rwandan francs. “Today” follows Africa/Kigali.
