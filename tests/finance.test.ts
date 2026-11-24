import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resetAndSeed } from "../src/lib/db";
import { collectCredit, createInvoice, ledger, listOutstanding, payInvoice } from "../src/lib/finance";
import { listDrugs, recordSale, staffByEmail } from "../src/lib/pharmacy";
import { dailyReport, salesByDay, salesByDrug } from "../src/lib/reports";
import { listPaymentMethods } from "../src/lib/settings";
import { staffEmails } from "../src/lib/seed";
import { kigaliToday } from "../src/lib/time";

beforeEach(async () => {
  await resetAndSeed();
});

test("credit stays outstanding until it is collected, and a supplier invoice is money out", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const amina = await staffByEmail(staffEmails.admin);
  const methods = await listPaymentMethods(true);
  const credit = methods.find((method) => method.code === "credit");
  const cash = methods.find((method) => method.code === "cash");
  assert.ok(credit);
  assert.ok(cash);
  const para = (await listDrugs()).find((item) => item.sku === "PARA-500");
  assert.ok(para);

  const sale = await recordSale(jean, {
    drugId: para.id,
    quantity: 2,
    customerName: "Aline",
    paymentMethodId: credit.id,
  });
  const due = await listOutstanding();
  assert.equal(due.some((item) => item.customerName === "Aline" && item.remaining === sale.total), true);

  const books = await ledger();
  const creditTender = books.tenders.find((item) => item.kind === "credit");
  assert.ok(creditTender);
  assert.equal(creditTender.onAccount >= sale.total, true);

  const collected = await collectCredit(amina, { saleId: sale.id, amount: sale.total, paymentMethodId: cash.id });
  assert.equal(collected.remaining, 0);
  assert.equal((await listOutstanding()).some((item) => item.customerName === "Aline"), false);

  const invoice = await createInvoice(amina, {
    supplierName: "Kigali Pharma Wholesale",
    invoiceNumber: "INV-42",
    amount: 15000,
    issuedOn: kigaliToday(),
    notes: "Monthly bill",
    purchaseOrderId: null,
  });
  await payInvoice(amina, invoice.id);
  const after = await ledger();
  assert.equal(after.moneyOut >= 15000, true);
});

test("reports total a day, a drug, and each day", async () => {
  const today = kigaliToday();
  const daily = await dailyReport(today);
  assert.equal(daily.date, today);
  assert.equal(daily.total, daily.sales.reduce((sum, sale) => sum + sale.total, 0));
  assert.ok(daily.count > 0);

  const byDrug = await salesByDrug(today, today);
  assert.equal(byDrug.total, daily.total);
  assert.ok(byDrug.drugs.some((drug) => drug.quantity > 0));

  const byDay = await salesByDay(today, today);
  assert.equal(byDay.days.length, 1);
  assert.equal(byDay.days[0].total, daily.total);
});
