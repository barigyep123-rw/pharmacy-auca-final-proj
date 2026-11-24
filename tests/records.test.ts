import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { listAudit } from "../src/lib/audit";
import { resetAndSeed } from "../src/lib/db";
import { ApiError } from "../src/lib/errors";
import { createInvoice, listInvoices } from "../src/lib/finance";
import { patientHistory, listPatients } from "../src/lib/patients";
import { listDrugs, listPrescriptions, recordSale, refillPrescription, staffByEmail } from "../src/lib/pharmacy";
import { listPaymentMethods } from "../src/lib/settings";
import { listSupplierProfiles, updateSupplier } from "../src/lib/suppliers";
import { staffEmails } from "../src/lib/seed";
import { kigaliToday } from "../src/lib/time";

beforeEach(async () => {
  await resetAndSeed();
});

test("a refill uses the same prescription until the allowance is spent", async () => {
  const jean = await staffByEmail(staffEmails.pharmacist);
  const cash = (await listPaymentMethods(true)).find((method) => method.code === "cash");
  assert.ok(cash);
  const script = (await listPrescriptions()).find((item) => item.patientName === "Chantal Uwimana");
  assert.ok(script);
  assert.equal(script.refillsAllowed, 2);
  assert.equal(script.fillsUsed, 1);
  assert.equal(script.refillsRemaining, 2);

  await refillPrescription(jean, script.id, cash.id);
  await refillPrescription(jean, script.id, cash.id);
  const spent = (await listPrescriptions()).find((item) => item.id === script.id);
  assert.ok(spent);
  assert.equal(spent.fillsUsed, 3);
  assert.equal(spent.refillsRemaining, 0);
  await assert.rejects(() => refillPrescription(jean, script.id, cash.id), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    return true;
  });

  const patients = await listPatients("Chantal");
  assert.equal(patients.length, 1);
  const history = await patientHistory(patients[0].id);
  assert.equal(history.prescriptions.length, 1);
  assert.equal(history.visits.filter((visit) => visit.kind === "fill").length, 3);
});

test("an invoice stays linked to the supplier profile, and the change is audited", async () => {
  const amina = await staffByEmail(staffEmails.admin);
  const [wholesale] = (await listSupplierProfiles()).filter((item) => item.name === "Kigali Pharma Wholesale");
  assert.ok(wholesale);
  assert.equal(wholesale.terms, "Net 30 days");

  const invoice = await createInvoice(amina, {
    supplierId: wholesale.id,
    supplierName: wholesale.name,
    invoiceNumber: "INV-77",
    amount: 8000,
    issuedOn: kigaliToday(),
    notes: "",
    purchaseOrderId: null,
  });
  assert.equal(invoice.supplierId, wholesale.id);
  assert.equal((await listInvoices()).find((item) => item.id === invoice.id)?.terms, "Net 30 days");

  await updateSupplier(amina, wholesale.id, {
    name: wholesale.name,
    contactName: "Aline Uwase",
    phone: wholesale.phone,
    email: "desk@kigalipharma.rw",
    address: wholesale.address,
    terms: "Net 15 days",
    notes: "",
    active: true,
  });
  assert.equal((await listInvoices()).find((item) => item.id === invoice.id)?.terms, "Net 15 days");

  const para = (await listDrugs()).find((item) => item.sku === "PARA-500");
  const cash = (await listPaymentMethods(true)).find((method) => method.code === "cash");
  assert.ok(para);
  assert.ok(cash);
  await recordSale(amina, { drugId: para.id, quantity: 1, customerName: "Walk-in", paymentMethodId: cash.id });
  const log = await listAudit(amina, "");
  assert.equal(log.some((entry) => entry.entity === "invoice" && entry.summary.includes("INV-77")), true);
  assert.equal(log.some((entry) => entry.entity === "sale"), true);
  assert.equal(log.some((entry) => entry.entity === "supplier" && entry.summary.includes("Kigali Pharma Wholesale")), true);

  const cashier = await staffByEmail(staffEmails.cashier);
  await assert.rejects(() => listAudit(cashier, ""), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 403);
    return true;
  });
});
