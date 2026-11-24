import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resetAndSeed } from "../src/lib/db";
import { collectAgainstSales } from "../src/lib/finance";
import {
  addDrugPhoto,
  creditAccounts,
  createDrug,
  getDrugPhoto,
  listBills,
  listDrugPhotos,
  listDrugs,
  recordBasket,
  removeDrugPhoto,
  staffByEmail,
  updateDrug,
} from "../src/lib/pharmacy";
import { listPaymentMethods } from "../src/lib/settings";
import { staffEmails } from "../src/lib/seed";

const jpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

beforeEach(async () => {
  await resetAndSeed();
});

test("a credit bill keeps a due date, a phone, and partial payments against the customer", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const methods = await listPaymentMethods(true);
  const credit = methods.find((method) => method.code === "credit");
  const cash = methods.find((method) => method.code === "cash");
  assert.ok(credit);
  assert.ok(cash);
  const drugs = await listDrugs();
  const para = drugs.find((item) => item.sku === "PARA-500");
  assert.ok(para);
  const basket = await recordBasket(jean, {
    customerName: "Eric Habimana",
    customerPhone: "0788123456",
    dueOn: "2026-12-24",
    paymentMethodId: credit.id,
    lines: [{ drugId: para.id, quantity: 2, paymentMethodId: credit.id }],
  });
  const bills = await listBills();
  const bill = bills.find((item) => item.customerName === "Eric Habimana");
  assert.ok(bill);
  assert.equal(bill.dueOn, "2026-12-24");
  assert.equal(bill.customerPhone, "0788123456");
  assert.equal(bill.balance, para.unitPrice * 2);
  assert.equal(bill.saleIds.length, 1);
  const accounts = creditAccounts(bills);
  assert.equal(accounts[0]?.customerName, "Eric Habimana");
  assert.equal(accounts[0]?.balance, bill.balance);
  const half = Math.floor(bill.balance / 2);
  const first = await collectAgainstSales(jean, {
    saleIds: bill.saleIds,
    amount: half,
    paymentMethodId: cash.id,
  });
  assert.equal(first.remaining, bill.balance - half);
  const rest = await collectAgainstSales(jean, {
    saleIds: bill.saleIds,
    amount: bill.balance - half,
    paymentMethodId: cash.id,
  });
  assert.equal(rest.remaining, 0);
  const settled = (await listBills()).find((item) => item.key === bill.key);
  assert.equal(settled?.balance, 0);
  assert.equal(settled?.history.length, 2);
  assert.equal(creditAccounts(await listBills()).some((account) => account.customerName === "Eric Habimana"), false);
  assert.ok(basket.id);
});

test("a brand keeps several packaging photos and the cover stays the first one", async () => {
  const amina = await staffByEmail(staffEmails.admin);
  const created = await createDrug(amina, {
    name: "Ibuprofen tablets",
    genericName: "Ibuprofen",
    category: "Pain",
    form: "tablet",
    strength: "400mg",
    sku: "IBU-PHOTO",
    unitPrice: 200,
    openingQuantity: 10,
    reorderLevel: 2,
    expiryDate: "2028-06-01",
    batchNumber: "B1",
    supplier: "Rwanda Medical Supply",
    photos: [jpeg, jpeg],
  });
  assert.equal(created.photoCount, 2);
  assert.equal(created.hasPhoto, true);
  const cover = await getDrugPhoto(created.id);
  assert.ok(cover);
  assert.equal(cover.bytes[0], 0xff);
  const added = await addDrugPhoto(amina, created.id, jpeg);
  assert.equal(added.photos.length, 3);
  const kept = await updateDrug(amina, created.id, {
    name: created.name,
    genericName: created.genericName,
    category: created.category,
    form: created.form,
    strength: created.strength,
    sku: created.sku,
    unitPrice: created.unitPrice,
    reorderLevel: created.reorderLevel,
    expiryDate: created.expiryDate,
    batchNumber: created.batchNumber,
    supplier: created.supplier,
  });
  assert.equal(kept.photoCount, 3);
  const remaining = await removeDrugPhoto(amina, created.id, added.photos[0].id);
  assert.equal(remaining.length, 2);
  assert.equal((await listDrugPhotos(created.id)).length, 2);
});
