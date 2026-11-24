# Pharmacie Ubuzima

Counter ledger for a neighborhood pharmacy in Kimironko, Kigali. It keeps the drug catalog, records walk-in sales, files prescriptions, and tracks supplier orders. Sales and dispensing take stock off the shelf. A supplier order increases stock only when the delivery is received.

## Stack

- Next.js, React, and TypeScript
- Node route handlers for the API
- Embedded Postgres via PGlite for local runs, so there is no database server to install
- Postgres when `DATABASE_URL` is set (used by the published app)
- Tailwind for the interface

Settings is under the counter menu and is only for an admin. Roles:

- Admin: the whole counter, including staff.
- Pharmacist: drugs, sales, prescriptions, patients, and the dashboard.
- Stock keeper: inventory, expiry, and supplier orders. No sales or prescriptions.
- Cashier: sales, prescriptions, patients, and finance.
- Dispenser: the counter, bills, and patients. The counter shows sellable stock only.

The header uses the pharmacy name saved in Settings. Counter sells a tablet, a strip, or a box, and can record dose, frequency, and duration on the receipt. Bills reprints that receipt. Inventory tracks lots and sells the earliest expiry first, and can record a customer return or a damaged or expired write-off. Categories live under Settings. Claims, the till count, and a physical stocktake sit with Finance and Inventory. A receipt carries a local fiscal mark. It is not an RRA-signed EBM receipt, and a saved “medicine is ready” note is not an SMS or WhatsApp send.

The first admin chooses their own password. Example accounts for the other three roles are created at that moment, and their passwords are shown once. They are not written into the source.

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
