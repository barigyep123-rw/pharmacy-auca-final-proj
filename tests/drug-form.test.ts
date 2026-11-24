import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resetAndSeed } from "../src/lib/db";
import { listBills, listDrugs, recordSale, staffByEmail } from "../src/lib/pharmacy";
import { listPaymentMethods } from "../src/lib/settings";
import { shapeStrength, unitsFromOpeningPacks } from "../src/lib/strength";
import { staffEmails } from "../src/lib/seed";

beforeEach(async () => {
  await resetAndSeed();
});

test("strength is stored as a number plus a unit, and opening packs divide the quantity", async () => {
  assert.equal(shapeStrength({ strengthValue: "200", strengthUnit: "mg" }).strength, "200 mg");
  assert.equal(unitsFromOpeningPacks(20, 1), 20);
  assert.equal(unitsFromOpeningPacks(20, 2), 10);
  assert.equal(unitsFromOpeningPacks(20, 3), null);
  const amina = await staffByEmail(staffEmails.admin);
  const { createDrug } = await import("../src/lib/pharmacy");
  const created = await createDrug(amina, {
    name: "Zinc tablets",
    genericName: "Zinc",
    category: "Supplement",
    form: "tablet",
    strengthValue: "20",
    strengthUnit: "mg",
    description: "A short course for appetite.",
    originCountry: "India",
    sku: "ZINC-FORM",
    unitPrice: 100,
    openingQuantity: 20,
    reorderLevel: 4,
    expiryDate: "2028-01-01",
    batchNumber: "Z1",
    supplier: "Rwanda Medical Supply",
    baseUnit: "tablet",
    packUnit: "blister",
    unitsPerPack: unitsFromOpeningPacks(20, 2) ?? 1,
    rssbCover: 85,
    mutuelleCover: 0,
  });
  assert.equal(created.strength, "20 mg");
  assert.equal(created.description, "A short course for appetite.");
  assert.equal(created.originCountry, "India");
  assert.equal(created.unitsPerPack, 10);
  assert.equal(created.rssbCover, 85);
  assert.equal(created.mutuelleCover, 0);
});

test("a sale paid at the counter shows that payment when the bill is opened", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const cash = (await listPaymentMethods(true)).find((method) => method.code === "cash");
  const para = (await listDrugs()).find((item) => item.sku === "PARA-500");
  assert.ok(cash);
  assert.ok(para);
  await recordSale(jean, { drugId: para.id, quantity: 1, paymentMethodId: cash.id, customerName: "Walk in" });
  const bill = (await listBills()).find((item) => item.lines.some((line) => line.name.includes("Paracetamol") || line.drugId === para.id));
  assert.ok(bill);
  assert.ok(bill.history.length > 0);
  assert.equal(bill.history[0]?.method, "Cash");
});
