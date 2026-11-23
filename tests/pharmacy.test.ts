import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resetAndSeed } from "../src/lib/db";
import { ApiError } from "../src/lib/errors";
import {
  cancelPrescription,
  cancelPurchaseOrder,
  createDrug,
  createPrescription,
  createPurchaseOrder,
  createSupplier,
  deleteDrug,
  dispensePrescription,
  getDashboard,
  listDrugs,
  listPurchaseOrders,
  listSupplierNames,
  receivePurchaseOrder,
  recordSale,
  staffByEmail,
  updateDrug,
} from "../src/lib/pharmacy";
import { seedFacts, staffEmails } from "../src/lib/seed";

beforeEach(async () => {
  await resetAndSeed();
});

async function drug(sku: string) {
  const drugs = await listDrugs();
  const found = drugs.find((item) => item.sku === sku);
  assert.ok(found, sku);
  return found;
}

test("sample ledger has today's sales, low stock, and an open supplier order", async () => {
  const dashboard = await getDashboard(await staffByEmail(staffEmails.admin));
  assert.equal(dashboard.totalDrugs, seedFacts.drugCount);
  assert.equal(dashboard.lowStock, seedFacts.lowStock);
  assert.equal(dashboard.todaySales.count, seedFacts.todaySalesCount);
  assert.equal(dashboard.todaySales.total, seedFacts.todaySalesTotal);
  assert.equal(dashboard.pendingPrescriptions, 2);
  assert.equal(dashboard.openOrderCount, 1);
  const cipro = await drug("CIPRO-500");
  assert.equal(cipro.quantity, 8);
  assert.equal(cipro.onOrder, 40);
  assert.equal(cipro.low, true);
});

test("a sale deducts stock and refuses oversell or expired stock", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const para = await drug("PARA-500");
  const sale = await recordSale(jean, { drugId: para.id, quantity: 2, customerName: "Walk-in" });
  assert.equal(sale.quantityLeft, para.quantity - 2);
  assert.equal(sale.total, para.unitPrice * 2);
  assert.equal((await drug("PARA-500")).quantity, para.quantity - 2);

  await assert.rejects(
    () => recordSale(jean, { drugId: para.id, quantity: 10_000, customerName: "" }),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );
  assert.equal((await drug("PARA-500")).quantity, para.quantity - 2);

  const expired = await drug("AZI-500");
  await assert.rejects(
    () => recordSale(jean, { drugId: expired.id, quantity: 1, customerName: "" }),
    (error: unknown) => error instanceof ApiError && /expired/i.test(error.message),
  );
  assert.equal((await drug("AZI-500")).quantity, expired.quantity);
});

test("placing a supplier order does not change stock until it is received", async () => {
  const keeper = await staffByEmail(staffEmails.stockKeeper);
  const zinc = await drug("ZINC-20");
  const before = zinc.quantity;
  const order = await createPurchaseOrder(keeper, {
    supplierName: "Kigali Pharma Wholesale",
    notes: "Extra zinc.",
    items: [
      { drugId: zinc.id, quantity: 24, unitCost: 25, expiryDate: "2028-04-01", batchNumber: "S2612" },
    ],
  });
  assert.equal(order.status, "ordered");
  assert.equal((await drug("ZINC-20")).quantity, before);
  assert.equal((await drug("ZINC-20")).onOrder, zinc.onOrder + 24);

  await receivePurchaseOrder(keeper, order.id);
  const after = await drug("ZINC-20");
  assert.equal(after.quantity, before + 24);
  assert.equal(after.expiryDate, "2028-04-01");
  assert.equal(after.batchNumber, "S2612");
  assert.equal(after.supplier, "Kigali Pharma Wholesale");
  assert.equal(after.onOrder, zinc.onOrder);

  await assert.rejects(
    () => receivePurchaseOrder(keeper, order.id),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );
  assert.equal((await drug("ZINC-20")).quantity, before + 24);
});

test("cancelling an open order leaves stock unchanged and a received order cannot be cancelled", async () => {
  const amina = await staffByEmail(staffEmails.admin);
  const ors = await drug("ORS-1");
  const order = await createPurchaseOrder(amina, {
    supplierName: "National Medical Store",
    notes: "",
    items: [{ drugId: ors.id, quantity: 10, unitCost: 200, expiryDate: "", batchNumber: "" }],
  });
  await cancelPurchaseOrder(amina, order.id);
  assert.equal((await drug("ORS-1")).quantity, ors.quantity);
  const orders = await listPurchaseOrders();
  assert.equal(orders.find((item) => item.id === order.id)?.status, "cancelled");

  const received = orders.find((item) => item.status === "received");
  assert.ok(received);
  await assert.rejects(
    () => cancelPurchaseOrder(amina, received.id),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );
});

test("dispensing a prescription deducts every line or none of them", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const amox = await drug("AMOX-500");
  const para = await drug("PARA-500");
  const created = await createPrescription(jean, {
    patientName: "Alice Uwera",
    patientPhone: "0781 000 111",
    doctorName: "Dr. Mukamana",
    notes: "",
    items: [
      { drugId: amox.id, quantity: 6, dosage: "1 capsule three times daily" },
      { drugId: para.id, quantity: 4, dosage: "1 tablet every 8 hours" },
    ],
  });
  assert.equal((await drug("AMOX-500")).quantity, amox.quantity);
  await dispensePrescription(jean, created.id);
  assert.equal((await drug("AMOX-500")).quantity, amox.quantity - 6);
  assert.equal((await drug("PARA-500")).quantity, para.quantity - 4);
  const dashboard = await getDashboard(await staffByEmail(staffEmails.admin));
  assert.ok(dashboard.todaySales.count >= seedFacts.todaySalesCount + 2);

  const cipro = await drug("CIPRO-500");
  const tooMuch = await createPrescription(jean, {
    patientName: "Eric Ndayisaba",
    patientPhone: "",
    doctorName: "",
    notes: "",
    items: [{ drugId: cipro.id, quantity: cipro.quantity + 5, dosage: "1 tablet twice daily" }],
  });
  await assert.rejects(
    () => dispensePrescription(jean, tooMuch.id),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );
  assert.equal((await drug("CIPRO-500")).quantity, cipro.quantity);
  await cancelPrescription(jean, tooMuch.id);
  await assert.rejects(
    () => dispensePrescription(jean, tooMuch.id),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );
});

test("roles stay inside their counters, and a drug with history cannot be removed", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const amina = await staffByEmail(staffEmails.admin);
  const keeper = await staffByEmail(staffEmails.stockKeeper);
  const cashier = await staffByEmail(staffEmails.cashier);
  const para = await drug("PARA-500");
  await updateDrug(jean, para.id, {
    name: para.name,
    genericName: para.genericName,
    category: para.category,
    form: para.form,
    strength: para.strength,
    sku: para.sku,
    unitPrice: para.unitPrice + 10,
    reorderLevel: para.reorderLevel,
    expiryDate: para.expiryDate,
    batchNumber: para.batchNumber,
    supplier: para.supplier,
  });
  assert.equal((await drug("PARA-500")).unitPrice, para.unitPrice + 10);
  await assert.rejects(
    () => deleteDrug(jean, para.id),
    (error: unknown) => error instanceof ApiError && error.status === 403,
  );
  await assert.rejects(
    () => recordSale(keeper, { drugId: para.id, quantity: 1, customerName: "" }),
    (error: unknown) => error instanceof ApiError && error.status === 403,
  );
  await assert.rejects(
    () => deleteDrug(cashier, para.id),
    (error: unknown) => error instanceof ApiError && error.status === 403,
  );
  await assert.rejects(
    () => deleteDrug(amina, para.id),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );

  const created = await createDrug(amina, {
    name: "Chlorhexidine mouthwash",
    genericName: "Chlorhexidine",
    category: "Dental",
    form: "drops",
    strength: "0.2%",
    sku: "CHX-02",
    unitPrice: 3500,
    openingQuantity: 4,
    reorderLevel: 2,
    expiryDate: "2028-01-01",
    batchNumber: "D1",
    supplier: "Rwanda Medical Supply",
  });
  await deleteDrug(amina, created.id);
  assert.equal((await listDrugs()).some((item) => item.sku === "CHX-02"), false);
});

test("supplier names come from the shelf, orders, and names saved on their own", async () => {
  const keeper = await staffByEmail(staffEmails.stockKeeper);
  const jean = await staffByEmail(staffEmails.pharmacist);
  const names = await listSupplierNames();
  assert.ok(names.includes("Kigali Pharma Wholesale"));
  assert.ok(names.includes("National Medical Store"));
  assert.ok(names.includes("Rwanda Medical Supply"));

  const zinc = await drug("ZINC-20");
  await createPurchaseOrder(keeper, {
    supplierName: "Nyagatare Depot",
    notes: "",
    items: [{ drugId: zinc.id, quantity: 2, unitCost: 10, expiryDate: "", batchNumber: "" }],
  });
  assert.ok((await listSupplierNames()).includes("Nyagatare Depot"));

  const created = await createSupplier(keeper, "  Butare   Meds  ");
  assert.equal(created.created, true);
  assert.equal(created.name, "Butare Meds");
  const again = await createSupplier(keeper, "butare meds");
  assert.equal(again.created, false);
  assert.equal(again.name, "Butare Meds");
  const listed = await listSupplierNames();
  assert.equal(listed.filter((name) => name.toLowerCase() === "butare meds").length, 1);
  assert.ok(listed.indexOf("Butare Meds") < listed.indexOf("Kigali Pharma Wholesale"));

  await assert.rejects(
    () => createSupplier(jean, "Another Wholesale"),
    (error: unknown) => error instanceof ApiError && error.status === 403,
  );
  await assert.rejects(
    () => createSupplier(keeper, " a "),
    (error: unknown) => error instanceof ApiError && error.status === 400,
  );
  assert.equal((await listSupplierNames()).includes("Another Wholesale"), false);
});
