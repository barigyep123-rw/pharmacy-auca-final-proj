import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { sql, resetAndSeed } from "../src/lib/db";
import { ApiError } from "../src/lib/errors";
import { addPolicy, addRule, quoteCoverage, saveCompany } from "../src/lib/insurance";
import { ensurePatient } from "../src/lib/patients";
import { listDrugs, recordBasket, staffByEmail } from "../src/lib/pharmacy";
import { listPaymentMethods } from "../src/lib/settings";
import { staffEmails } from "../src/lib/seed";

beforeEach(async () => {
  await resetAndSeed();
});

async function card(member: string, insurerName: string) {
  const amina = await staffByEmail(staffEmails.admin);
  const [insurer] = await sql<{ id: number }>(`select id from insurers where lower(name) = lower($1)`, [insurerName]);
  assert.ok(insurer);
  const patientId = await ensurePatient(sql, amina, { name: "Diane Ingabire", phone: "0788001122" });
  await addPolicy(amina, patientId, { insurerId: insurer.id, memberNumber: member, isPrimary: true });
  return { amina, patientId, insurerId: insurer.id };
}

test("an RSSB card pays a category rate on a chronic medicine and leaves an OTC line with the patient", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const { amina, insurerId } = await card("RAMA-100", "RSSB");
  await addRule(amina, insurerId, { scope: "category", name: "Chronic care", covered: true, coverPercent: 80 });
  const methods = await listPaymentMethods(true);
  const cash = methods.find((method) => method.code === "cash");
  assert.ok(cash);
  const drugs = await listDrugs();
  const met = drugs.find((item) => item.sku === "MET-500");
  const para = drugs.find((item) => item.sku === "PARA-500");
  assert.ok(met);
  assert.ok(para);
  const basket = await recordBasket(jean, {
    customerName: "",
    memberNumber: "RAMA-100",
    paymentMethodId: cash.id,
    lines: [
      { drugId: met.id, quantity: 2, paymentMethodId: cash.id },
      { drugId: para.id, quantity: 1, paymentMethodId: cash.id },
    ],
  });
  assert.equal(basket.receipt.customerName, "Diane Ingabire");
  assert.match(basket.receipt.fiscalNote ?? "", /RSSB pays/);
  const rows = await sql<{ insurer_amount: number; drug: string }>(
    `select sc.insurer_amount, d.sku as drug
     from sale_coverages sc
     join sales s on s.id = sc.sale_id
     join drugs d on d.id = s.drug_id
     where s.basket_id = $1
     order by d.sku`,
    [basket.id],
  );
  const covered = rows.find((row) => row.drug === "MET-500");
  assert.ok(covered);
  assert.equal(Number(covered.insurer_amount), Math.round(met.unitPrice * 2 * 0.8));
  assert.equal(rows.some((row) => row.drug === "PARA-500"), false);
  const [claim] = await sql<{ insurer_amount: number; status: string }>(
    `select insurer_amount, status from claims where member_number = 'RAMA-100'`,
  );
  assert.equal(claim.status, "draft");
  assert.equal(Number(claim.insurer_amount), Math.round(met.unitPrice * 2 * 0.8));
});

test("an unknown card is refused before stock moves", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const cash = (await listPaymentMethods(true)).find((method) => method.code === "cash");
  const para = (await listDrugs()).find((item) => item.sku === "PARA-500");
  assert.ok(cash);
  assert.ok(para);
  const before = para.quantity;
  await assert.rejects(
    () => recordBasket(jean, {
      customerName: "Walk in",
      memberNumber: "NO-SUCH-CARD",
      paymentMethodId: cash.id,
      lines: [{ drugId: para.id, quantity: 1, paymentMethodId: cash.id }],
    }),
    (error: unknown) => error instanceof ApiError && error.status === 404,
  );
  const after = (await listDrugs()).find((item) => item.sku === "PARA-500");
  assert.equal(after?.quantity, before);
});

test("an exclusion blocks, and accepting it leaves the patient to pay", async () => {
  const { amina } = await card("UAP-9", "UAP");
  await addRule(amina, (await sql<{ id: number }>(`select id from insurers where lower(name) = 'uap'`))[0].id, {
    scope: "category",
    name: "Supplement",
    covered: false,
  });
  const jean = await staffByEmail(staffEmails.pharmacist);
  const cash = (await listPaymentMethods(true)).find((method) => method.code === "cash");
  const ors = (await listDrugs()).find((item) => item.sku === "ORS-1");
  assert.ok(cash);
  assert.ok(ors);
  const lines = [{ drugId: ors.id, quantity: 1, total: ors.unitPrice }];
  await assert.rejects(
    () => quoteCoverage({ memberNumber: "UAP-9", lines }),
    (error: unknown) => error instanceof ApiError && /excluded/i.test(error.message),
  );
  const quote = await quoteCoverage({ memberNumber: "UAP-9", lines, acknowledgeRisks: true });
  assert.equal(quote.insurerAmount, 0);
  assert.equal(quote.patientPayable, ors.unitPrice);
});

test("a spending limit caps the insurer and a stacking insurer can pay the remainder", async () => {
  const amina = await staffByEmail(staffEmails.admin);
  const primary = await saveCompany(amina, {
    name: "Cap Plan",
    kind: "private",
    phone: "",
    email: "",
    address: "",
    coverPercent: 100,
    period: "prescription",
    spendingLimit: 1000,
    limitAction: "warn",
    stacks: false,
    formularyMode: "open",
    coverOtc: true,
    notes: "",
    active: true,
  });
  const secondary = await saveCompany(amina, {
    name: "Top Up",
    kind: "private",
    phone: "",
    email: "",
    address: "",
    coverPercent: 50,
    period: "year",
    spendingLimit: null,
    limitAction: "warn",
    stacks: true,
    formularyMode: "open",
    coverOtc: true,
    notes: "",
    active: true,
  });
  const patientId = await ensurePatient(sql, amina, { name: "Jean Bosco", phone: "0788111222" });
  await addPolicy(amina, patientId, { insurerId: primary.id, memberNumber: "CAP-1", isPrimary: true });
  await addPolicy(amina, patientId, { insurerId: secondary.id, memberNumber: "TOP-1", isPrimary: false });
  const quote = await quoteCoverage({
    memberNumber: "CAP-1",
    lines: [{ drugId: (await listDrugs()).find((item) => item.sku === "PARA-500")!.id, total: 5000 }],
  });
  assert.equal(quote.shares.find((share) => share.insurerName === "Cap Plan")?.amount, 1000);
  assert.equal(quote.shares.find((share) => share.insurerName === "Top Up")?.amount, 2000);
  assert.equal(quote.patientPayable, 2000);
});
