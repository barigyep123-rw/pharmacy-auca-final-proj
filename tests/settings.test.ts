import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resetAndSeed } from "../src/lib/db";
import { ApiError } from "../src/lib/errors";
import { listSales, recordSale, staffByEmail } from "../src/lib/pharmacy";
import { staffEmails } from "../src/lib/seed";
import {
  getBusinessProfile,
  listCurrencies,
  listPaymentMethods,
  removePaymentMethod,
  saleTotal,
  updateBusinessProfile,
} from "../src/lib/settings";

beforeEach(async () => {
  await resetAndSeed();
});

test("the counter starts with francs and the four tender types", async () => {
  const currencies = await listCurrencies();
  assert.equal(currencies.find((item) => item.isDefault)?.code, "RWF");
  const methods = await listPaymentMethods();
  assert.deepEqual(
    methods.map((item) => item.code),
    ["cash", "mobile_money", "card", "credit"],
  );
  assert.equal(methods.find((item) => item.code === "credit")?.settlesImmediately, false);
  assert.equal(methods.find((item) => item.code === "mobile_money")?.settlesImmediately, true);
  const profile = await getBusinessProfile();
  assert.equal(profile.name, "Pharmacie Ubuzima");
  assert.equal(profile.receiptPrefix, "UBZ");
});

test("a sale records the tender and the next receipt number", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const [cash] = await listPaymentMethods(true);
  const drugs = await import("../src/lib/pharmacy").then((mod) => mod.listDrugs());
  const drug = drugs.find((item) => item.sku === "PARA-500");
  assert.ok(drug);
  await recordSale(jean, { drugId: drug.id, quantity: 2, customerName: "Aline", paymentMethodId: cash.id });
  const sale = (await listSales()).find((item) => item.customerName === "Aline");
  assert.ok(sale);
  assert.equal(sale.paymentMethodName, cash.name);
  assert.match(sale.receiptNumber, /^UBZ-\d{4}$/);
  assert.equal(sale.total, drug.unitPrice * 2);
});

test("the last active payment method stays", async () => {
  const amina = await staffByEmail(staffEmails.admin);
  const methods = await listPaymentMethods();
  for (const method of methods.slice(1)) {
    await removePaymentMethod(amina, method.id);
  }
  await assert.rejects(
    () => removePaymentMethod(amina, methods[0].id),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );
});

test("a default discount changes the sale total and zero tax does not", async () => {
  assert.equal(saleTotal(1000, 2, { defaultDiscountBps: 0, taxRateBps: 0, pricesIncludeTax: true }), 2000);
  assert.equal(saleTotal(1000, 2, { defaultDiscountBps: 1000, taxRateBps: 0, pricesIncludeTax: true }), 1800);
  const amina = await staffByEmail(staffEmails.admin);
  const current = await getBusinessProfile();
  const saved = await updateBusinessProfile(amina, { ...current, defaultDiscountBps: 500 });
  assert.equal(saved.defaultDiscountBps, 500);
  assert.equal(saved.receiptNext, current.receiptNext);
});
