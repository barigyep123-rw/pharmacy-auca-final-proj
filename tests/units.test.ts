import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resetAndSeed } from "../src/lib/db";
import { listDrugs, listPurchaseOrders, receivePurchaseOrder, recordSale, staffByEmail, updateDrug } from "../src/lib/pharmacy";
import { listDrafts, mergeDrafts, scanReorderDrafts, sendDraft } from "../src/lib/reorder";
import { listPaymentMethods } from "../src/lib/settings";
import { staffEmails } from "../src/lib/seed";

beforeEach(async () => {
  await resetAndSeed();
});

test("a box sale deducts base units and leaves a partial box whole", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const cash = (await listPaymentMethods(true)).find((method) => method.code === "cash");
  assert.ok(cash);
  const before = (await listDrugs()).find((item) => item.sku === "ZINC-20");
  assert.ok(before);
  assert.equal(before.baseUnit, "tablet");
  assert.equal(before.unitsPerPack, 10);
  assert.notEqual(before.quantity % before.unitsPerPack, 0);
  const sale = await recordSale(jean, {
    drugId: before.id,
    quantity: 1,
    soldAs: "pack",
    customerName: "Aline",
    paymentMethodId: cash.id,
  });
  assert.equal(sale.quantityLeft, before.quantity - 10);
  const after = (await listDrugs()).find((item) => item.id === before.id);
  assert.ok(after);
  assert.equal(after.quantity, before.quantity - 10);
  assert.notEqual(after.quantity % after.unitsPerPack, 0);
});

test("a reorder scan drafts whole packs, and merging then sending does not change stock", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const keeper = await staffByEmail(staffEmails.stockKeeper);
  const amox = (await listDrugs()).find((item) => item.sku === "AMOX-500");
  assert.ok(amox);
  await updateDrug(jean, amox.id, {
    name: amox.name,
    genericName: amox.genericName,
    category: amox.category,
    form: amox.form,
    strength: amox.strength,
    sku: amox.sku,
    unitPrice: amox.unitPrice,
    reorderLevel: amox.quantity + amox.unitsPerPack,
    expiryDate: amox.expiryDate,
    batchNumber: amox.batchNumber,
    supplier: amox.supplier,
    baseUnit: amox.baseUnit,
    packUnit: amox.packUnit,
    unitsPerPack: amox.unitsPerPack,
  });
  const first = await scanReorderDrafts(jean);
  assert.ok(first.lines > 0);
  const drafts = (await listDrafts()).drafts;
  const amoxLine = drafts.flatMap((draft) => draft.lines).find((line) => line.drugName === "Amoxicillin");
  assert.ok(amoxLine);
  assert.equal(amoxLine.quantity % amoxLine.unitsPerPack, 0);
  assert.equal(drafts.some((draft) => draft.lines.some((line) => line.drugName === "Paracetamol")), false);

  const alb = (await listDrugs()).find((item) => item.sku === "ALB-400");
  assert.ok(alb);
  await updateDrug(jean, alb.id, {
    name: alb.name,
    genericName: alb.genericName,
    category: alb.category,
    form: alb.form,
    strength: alb.strength,
    sku: alb.sku,
    unitPrice: alb.unitPrice,
    reorderLevel: alb.quantity + alb.unitsPerPack,
    expiryDate: alb.expiryDate,
    batchNumber: alb.batchNumber,
    supplier: alb.supplier,
    baseUnit: alb.baseUnit,
    packUnit: alb.packUnit,
    unitsPerPack: alb.unitsPerPack,
  });
  const second = await scanReorderDrafts(jean);
  assert.equal(second.lines >= 1, true);
  const both = (await listDrafts()).drafts;
  assert.ok(both.length >= 2);
  const onHand = (await listDrugs()).find((item) => item.sku === "AMOX-500")?.quantity;
  const merged = await mergeDrafts(jean, both.slice(0, 2).map((draft) => draft.id), "Kigali Pharma Wholesale");
  const waiting = (await listDrafts()).drafts;
  assert.equal(waiting.some((draft) => draft.id === merged.id), true);
  assert.equal(waiting.filter((draft) => both.slice(0, 2).some((source) => source.id === draft.id)).length, 0);
  await sendDraft(jean, merged.id);
  assert.equal((await listDrugs()).find((item) => item.sku === "AMOX-500")?.quantity, onHand);
  const sent = (await listPurchaseOrders()).find((order) => order.id === merged.id);
  assert.equal(sent?.status, "ordered");
  assert.equal(sent?.supplierName, "Kigali Pharma Wholesale");
  await receivePurchaseOrder(keeper, merged.id);
  const received = (await listDrugs()).find((item) => item.sku === "AMOX-500");
  assert.ok(received);
  assert.ok(received.quantity > (onHand ?? 0));
});
