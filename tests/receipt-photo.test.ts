import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { resetAndSeed } from "../src/lib/db";
import { ApiError } from "../src/lib/errors";
import { decodePhoto } from "../src/lib/photo";
import {
  createDrug,
  createPrescription,
  dispensePrescription,
  getDrugPhoto,
  listDrugs,
  recordSale,
  staffByEmail,
  updateDrug,
} from "../src/lib/pharmacy";
import { staffEmails } from "../src/lib/seed";

const jpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

beforeEach(async () => {
  await resetAndSeed();
});

test("a new drug can keep a photo, and a sale returns an 80mm receipt", async () => {
  const amina = await staffByEmail(staffEmails.admin);
  const jean = await staffByEmail(staffEmails.pharmacist);
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
    photo: jpeg,
  });
  assert.equal(created.hasPhoto, true);
  const photo = await getDrugPhoto(created.id);
  assert.ok(photo);
  assert.equal(photo.type, "image/jpeg");
  assert.equal(photo.bytes[0], 0xff);
  assert.equal(photo.bytes[1], 0xd8);

  const cleared = await updateDrug(amina, created.id, {
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
    photo: null,
  });
  assert.equal(cleared.hasPhoto, false);
  assert.equal(await getDrugPhoto(created.id), null);

  const [cash] = await import("../src/lib/settings").then((mod) => mod.listPaymentMethods(true));
  const para = (await listDrugs()).find((item) => item.sku === "PARA-500");
  assert.ok(para);
  const sale = await recordSale(jean, {
    drugId: para.id,
    quantity: 2,
    customerName: "Aline",
    paymentMethodId: cash.id,
  });
  assert.match(sale.receipt.numbers[0], /^UBZ-\d{4}$/);
  assert.equal(sale.receipt.lines[0].name, para.name);
  assert.equal(sale.receipt.lines[0].total, sale.total);
  assert.equal(sale.receipt.paymentMethodName, "Cash");
  assert.equal(sale.receipt.settlesImmediately, true);

  const script = await createPrescription(jean, {
    patientName: "Diane Ingabire",
    patientPhone: "",
    doctorName: "Dr. Mukamana",
    notes: "",
    items: [
      { drugId: para.id, quantity: 1, dosage: "One tablet" },
      { drugId: created.id, quantity: 1, dosage: "Rinse" },
    ],
  });
  const receipt = await dispensePrescription(jean, script.id, cash.id);
  assert.equal(receipt.lines.length, 2);
  assert.equal(receipt.customerName, "Diane Ingabire");
  assert.equal(receipt.numbers.length, 2);
  assert.notEqual(receipt.numbers[0], receipt.numbers[1]);
});

test("a photo that is not an image is refused", () => {
  assert.throws(
    () => decodePhoto("data:image/jpeg;base64,aGVsbG8="),
    (error: unknown) => error instanceof ApiError && error.status === 400,
  );
});
