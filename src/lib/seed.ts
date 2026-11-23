import { exampleStaff } from "./example-staff";
import { hashPassword } from "./password";
import type { QueryFn } from "./query";
import type { Role } from "./types";

type StaffPasswords = Record<Role, string>;

export const staffEmails = {
  admin: "amina@ubuzima.rw",
  pharmacist: "jean@ubuzima.rw",
  stockKeeper: "claudine@ubuzima.rw",
  cashier: "eric@ubuzima.rw",
} as const;

const staffPlan: Array<{ name: string; email: string; role: Role }> = [
  { name: "Amina Uwase", email: staffEmails.admin, role: "admin" },
  ...exampleStaff,
];

type DrugSeed = {
  sku: string;
  name: string;
  genericName: string;
  category: string;
  form: string;
  strength: string;
  unitPrice: number;
  quantity: number;
  reorderLevel: number;
  expiryDate: string;
  batchNumber: string;
  supplier: string;
};

const drugRows: Array<[string, string, string, string, string, string, number, number, number, string, string, string]> = [
  ["PARA-500", "Paracetamol", "Paracetamol", "Analgesic", "tablet", "500 mg", 100, 240, 80, "2027-06-01", "B2411", "Rwanda Medical Supply"],
  ["IBU-400", "Ibuprofen", "Ibuprofen", "Analgesic", "tablet", "400 mg", 150, 30, 40, "2027-03-12", "B2408", "Kigali Pharma Wholesale"],
  ["AMOX-500", "Amoxicillin", "Amoxicillin", "Antibiotic", "capsule", "500 mg", 250, 86, 40, "2026-12-18", "B2510", "Rwanda Medical Supply"],
  ["COAR-20", "Coartem", "Artemether/Lumefantrine", "Antimalarial", "tablet", "20/120 mg", 900, 64, 24, "2027-08-01", "M2601", "National Medical Store"],
  ["ORS-1", "Oral rehydration salts", "ORS", "Supplement", "sachet", "20.5 g", 300, 16, 40, "2027-04-01", "O2512", "Kigali Pharma Wholesale"],
  ["MET-500", "Metformin", "Metformin", "Chronic care", "tablet", "500 mg", 80, 360, 100, "2028-01-20", "C2502", "Rwanda Medical Supply"],
  ["AML-5", "Amlodipine", "Amlodipine", "Chronic care", "tablet", "5 mg", 120, 90, 40, "2027-11-02", "C2506", "Rwanda Medical Supply"],
  ["CIPRO-500", "Ciprofloxacin", "Ciprofloxacin", "Antibiotic", "tablet", "500 mg", 200, 8, 24, "2026-12-05", "B2409", "Kigali Pharma Wholesale"],
  ["ALB-400", "Albendazole", "Albendazole", "Antiparasitic", "tablet", "400 mg", 500, 42, 16, "2027-09-14", "P2503", "National Medical Store"],
  ["OME-20", "Omeprazole", "Omeprazole", "Gastrointestinal", "capsule", "20 mg", 180, 70, 24, "2027-05-22", "G2501", "Kigali Pharma Wholesale"],
  ["SALB-INH", "Salbutamol inhaler", "Salbutamol", "Respiratory", "inhaler", "100 mcg", 8500, 6, 4, "2027-04-18", "R2507", "Rwanda Medical Supply"],
  ["AZI-500", "Azithromycin", "Azithromycin", "Antibiotic", "tablet", "500 mg", 700, 24, 12, "2026-11-20", "B2404", "Kigali Pharma Wholesale"],
  ["CET-10", "Cetirizine", "Cetirizine", "Antihistamine", "tablet", "10 mg", 90, 150, 40, "2028-02-01", "H2508", "Rwanda Medical Supply"],
  ["COT-480", "Cotrimoxazole", "Sulfamethoxazole/Trimethoprim", "Antibiotic", "tablet", "480 mg", 60, 210, 60, "2027-07-09", "B2511", "National Medical Store"],
  ["ZINC-20", "Zinc sulfate", "Zinc sulfate", "Supplement", "tablet", "20 mg", 40, 12, 36, "2027-02-11", "S2505", "Kigali Pharma Wholesale"],
  ["DIC-50", "Diclofenac", "Diclofenac", "Analgesic", "tablet", "50 mg", 70, 80, 30, "2027-10-03", "B2502", "Rwanda Medical Supply"],
];

export const drugPlan: DrugSeed[] = drugRows.map((row) => ({
  sku: row[0],
  name: row[1],
  genericName: row[2],
  category: row[3],
  form: row[4],
  strength: row[5],
  unitPrice: row[6],
  quantity: row[7],
  reorderLevel: row[8],
  expiryDate: row[9],
  batchNumber: row[10],
  supplier: row[11],
}));

const todaySales = [
  { sku: "PARA-500", quantity: 20, customer: "", clock: "09:10" },
  { sku: "MET-500", quantity: 60, customer: "Eric Ndayisaba", clock: "11:05" },
  { sku: "IBU-400", quantity: 8, customer: "", clock: "14:20" },
  { sku: "ORS-1", quantity: 4, customer: "Diane Ingabire", clock: "15:05" },
  { sku: "CET-10", quantity: 10, customer: "Chantal Uwimana", clock: "16:40" },
];

export const seedFacts = {
  drugCount: drugPlan.length,
  lowStock: drugPlan.filter((drug) => drug.quantity <= drug.reorderLevel).length,
  todaySalesCount: todaySales.length,
  todaySalesTotal: todaySales.reduce((sum, line) => {
    const drug = drugPlan.find((item) => item.sku === line.sku);
    return sum + (drug ? drug.unitPrice * line.quantity : 0);
  }, 0),
};

function kigaliStamp(dayOffset: number, clock: string) {
  if (!Number.isInteger(dayOffset) || !/^\d{2}:\d{2}$/.test(clock)) {
    throw new Error("Sample timestamp is not valid.");
  }
  return `(date_trunc('day', now() at time zone 'Africa/Kigali') + interval '${dayOffset} days' + time '${clock}') at time zone 'Africa/Kigali'`;
}

async function userId(query: QueryFn, email: string) {
  const [row] = await query<{ id: number }>(`select id from users where email = $1`, [email]);
  if (!row) throw new Error(`Missing sample user ${email}`);
  return row.id;
}

async function drugBySku(query: QueryFn, sku: string) {
  const [row] = await query<{ id: number; unit_price: number }>(
    `select id, unit_price from drugs where sku = $1`,
    [sku],
  );
  if (!row) throw new Error(`Missing sample drug ${sku}`);
  return row;
}

export async function seedCatalog(query: QueryFn) {
  const [row] = await query<{ n: number }>("select count(*)::int as n from drugs");
  if ((row?.n ?? 0) > 0) return;
  for (const drug of drugPlan) {
    await query(
      `insert into drugs (
        name, generic_name, category, form, strength, sku, unit_price, quantity,
        reorder_level, expiry_date, batch_number, supplier
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        drug.name,
        drug.genericName,
        drug.category,
        drug.form,
        drug.strength,
        drug.sku,
        drug.unitPrice,
        drug.quantity,
        drug.reorderLevel,
        drug.expiryDate,
        drug.batchNumber,
        drug.supplier,
      ],
    );
  }
}

export async function insertSeed(query: QueryFn, passwords: StaffPasswords) {
  if (passwords.admin.trim() === "" || passwords.pharmacist.trim() === "") {
    throw new Error("Staff passwords are required before sample accounts can be created.");
  }
  for (const account of staffPlan) {
    const passwordHash = await hashPassword(passwords[account.role]);
    await query(
      `insert into users (name, email, password_hash, role) values ($1, $2, $3, $4)`,
      [account.name, account.email, passwordHash, account.role],
    );
  }

  await seedCatalog(query);

  const adminId = await userId(query, staffEmails.admin);
  const pharmacistId = await userId(query, staffEmails.pharmacist);

  const paracetamol = await drugBySku(query, "PARA-500");
  await query(
    `insert into purchase_orders (supplier_name, status, notes, ordered_by, received_by, ordered_at, received_at)
     values (
       'Rwanda Medical Supply',
       'received',
       'Monthly analgesic top-up.',
       $1, $1,
       ${kigaliStamp(-1, "15:10")},
       ${kigaliStamp(-1, "15:40")}
     )`,
    [adminId],
  );
  const [received] = await query<{ id: number }>(
    `select id from purchase_orders where status = 'received' order by id desc limit 1`,
  );
  await query(
    `insert into purchase_order_items (order_id, drug_id, quantity, unit_cost, expiry_date, batch_number)
     values ($1, $2, 200, 70, '2027-06-01', 'B2411')`,
    [received.id, paracetamol.id],
  );

  await query(
    `insert into purchase_orders (supplier_name, status, notes, ordered_by, ordered_at)
     values (
       'Kigali Pharma Wholesale',
       'ordered',
       'Cover the low shelves before the weekend.',
       $1,
       ${kigaliStamp(0, "08:05")}
     )`,
    [pharmacistId],
  );
  const [openOrder] = await query<{ id: number }>(
    `select id from purchase_orders where status = 'ordered' order by id desc limit 1`,
  );
  const openLines = [
    ["IBU-400", 80, 110, "", ""],
    ["CIPRO-500", 40, 140, "2028-01-15", "B2611"],
    ["ZINC-20", 100, 25, "", ""],
    ["ORS-1", 60, 210, "", ""],
  ] as const;
  for (const [sku, quantity, cost, expiry, batch] of openLines) {
    const drug = await drugBySku(query, sku);
    await query(
      `insert into purchase_order_items (order_id, drug_id, quantity, unit_cost, expiry_date, batch_number)
       values ($1, $2, $3, $4, nullif($5, ''), $6)`,
      [openOrder.id, drug.id, quantity, cost, expiry, batch],
    );
  }

  const cetirizine = await drugBySku(query, "CET-10");
  const [dispensed] = await query<{ id: number }>(
    `insert into prescriptions (
      patient_name, patient_phone, doctor_name, notes, status, created_by, dispensed_by, dispensed_at, created_at
    ) values (
      'Chantal Uwimana', '0788 114 230', 'Dr. Ingabire', 'Allergic rhinitis.',
      'dispensed', $1, $2, ${kigaliStamp(0, "16:40")}, ${kigaliStamp(0, "11:20")}
    ) returning id`,
    [pharmacistId, pharmacistId],
  );
  await query(
    `insert into prescription_items (prescription_id, drug_id, quantity, dosage, unit_price)
     values ($1, $2, 10, '1 tablet at night for 10 days', $3)`,
    [dispensed.id, cetirizine.id, cetirizine.unit_price],
  );

  for (const line of todaySales) {
    const drug = await drugBySku(query, line.sku);
    await query(
      `insert into sales (drug_id, quantity, unit_price, total, customer_name, sold_by, prescription_id, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, ${kigaliStamp(0, line.clock)})`,
      [
        drug.id,
        line.quantity,
        drug.unit_price,
        drug.unit_price * line.quantity,
        line.customer,
        pharmacistId,
        line.sku === "CET-10" ? dispensed.id : null,
      ],
    );
  }

  const yesterday = [
    ["AMOX-500", 14, "Samuel Habineza", "16:10"],
    ["DIC-50", 6, "", "17:25"],
    ["OME-20", 10, "Alice Uwera", "12:40"],
    ["ALB-400", 2, "Walk-in family", "10:15"],
  ] as const;
  for (const [sku, quantity, customer, clock] of yesterday) {
    const drug = await drugBySku(query, sku);
    await query(
      `insert into sales (drug_id, quantity, unit_price, total, customer_name, sold_by, created_at)
       values ($1, $2, $3, $4, $5, $6, ${kigaliStamp(-1, clock)})`,
      [drug.id, quantity, drug.unit_price, drug.unit_price * quantity, customer, adminId],
    );
  }

  const amox = await drugBySku(query, "AMOX-500");
  const para = await drugBySku(query, "PARA-500");
  const [pendingA] = await query<{ id: number }>(
    `insert into prescriptions (patient_name, patient_phone, doctor_name, notes, status, created_by, created_at)
     values ('Diane Ingabire', '0788 221 014', 'Dr. Mukamana', 'Upper respiratory infection.', 'pending', $1, ${kigaliStamp(0, "10:30")})
     returning id`,
    [pharmacistId],
  );
  await query(
    `insert into prescription_items (prescription_id, drug_id, quantity, dosage, unit_price) values
     ($1, $2, 21, '1 capsule three times daily for 7 days', $3),
     ($1, $4, 10, '1 tablet every 8 hours if fever', $5)`,
    [pendingA.id, amox.id, amox.unit_price, para.id, para.unit_price],
  );

  const coartem = await drugBySku(query, "COAR-20");
  const [pendingB] = await query<{ id: number }>(
    `insert into prescriptions (patient_name, patient_phone, doctor_name, notes, status, created_by, created_at)
     values ('Samuel Habineza', '0783 440 192', 'Dr. Kagabo', 'Uncomplicated malaria.', 'pending', $1, ${kigaliStamp(-1, "18:05")})
     returning id`,
    [adminId],
  );
  await query(
    `insert into prescription_items (prescription_id, drug_id, quantity, dosage, unit_price)
     values ($1, $2, 24, '4 tablets now, then 4 after 8 hours, then 4 every 12 hours', $3)`,
    [pendingB.id, coartem.id, coartem.unit_price],
  );

  const azi = await drugBySku(query, "AZI-500");
  const [cancelled] = await query<{ id: number }>(
    `insert into prescriptions (patient_name, patient_phone, doctor_name, notes, status, created_by, created_at)
     values ('Patrick Bizimana', '0782 019 884', 'Dr. Kagabo', 'Held back. The shelf batch is past expiry.', 'cancelled', $1, ${kigaliStamp(-2, "09:50")})
     returning id`,
    [pharmacistId],
  );
  await query(
    `insert into prescription_items (prescription_id, drug_id, quantity, dosage, unit_price)
     values ($1, $2, 3, '1 tablet daily for 3 days', $3)`,
    [cancelled.id, azi.id, azi.unit_price],
  );
}
