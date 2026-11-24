import { z } from "zod";
import { ApiError } from "./errors";

const sku = z
  .string()
  .trim()
  .min(2, "Enter a SKU.")
  .max(32)
  .transform((value) => value.toUpperCase());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .default("");

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real expiry date.");

export const drugInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the drug name.").max(80),
  genericName: z.string().trim().min(2, "Choose a generic group, or type a new one.").max(80),
  category: z.string().trim().min(2, "Enter a category.").max(40),
  categoryId: z.number().int().positive().nullable().optional(),
  subcategoryId: z.number().int().positive().nullable().optional(),
  brandName: optionalText(80),
  manufacturer: optionalText(80),
  barcode: optionalText(40),
  rxOnly: z.boolean().optional().default(false),
  stripSize: z.number().int().min(1).max(10_000).optional().default(10),
  stripPrice: z.number().int().min(0).max(5_000_000).optional().default(0),
  packPrice: z.number().int().min(0).max(5_000_000).optional().default(0),
  form: z.string().trim().min(2, "Choose a form.").max(24),
  strength: optionalText(40),
  sku,
  unitPrice: z.number().int().min(0, "Price cannot be negative.").max(5_000_000),
  openingQuantity: z.number().int().min(0).max(100_000),
  reorderLevel: z.number().int().min(0).max(100_000),
  expiryDate: dateText,
  batchNumber: optionalText(40),
  supplier: optionalText(80),
  baseUnit: z.string().trim().min(2).max(24).optional().default("tablet"),
  packUnit: z.string().trim().min(2).max(24).optional().default("box"),
  unitsPerPack: z.number().int().min(1).max(10_000).optional().default(1),
  photo: z.string().trim().max(900_000, "That photo is too large.").optional(),
});

export const drugUpdateSchema = drugInputSchema.omit({ openingQuantity: true, photo: true }).extend({
  photo: z.string().trim().max(900_000, "That photo is too large.").nullable().optional(),
});

export const saleSchema = z.object({
  drugId: z.number().int().positive(),
  quantity: z.number().int().min(1, "Quantity must be at least 1.").max(5_000),
  soldAs: z.enum(["base", "strip", "pack"]).optional().default("base"),
  customerName: optionalText(80),
  paymentMethodId: z.number().int().min(1, "Choose how the customer is paying."),
  patientId: z.number().int().positive().nullable().optional(),
  directions: optionalText(160),
  dose: optionalText(40),
  route: optionalText(40),
  frequency: optionalText(40),
  duration: optionalText(40),
  acknowledgeRisks: z.boolean().optional().default(false),
  prescriptionId: z.number().int().positive().nullable().optional(),
});

const tenderLineSchema = z.object({
  paymentMethodId: z.number().int().positive(),
  amount: z.number().int().min(1).max(50_000_000),
});

export const basketSchema = z.object({
  customerName: optionalText(80),
  paymentMethodId: z.number().int().min(1, "Choose how the customer is paying."),
  patientId: z.number().int().positive().nullable().optional(),
  memberNumber: optionalText(40),
  acknowledgeRisks: z.boolean().optional().default(false),
  lines: z.array(saleSchema.omit({ customerName: true, paymentMethodId: true, patientId: true, acknowledgeRisks: true })).min(1).max(20),
  tenders: z.array(tenderLineSchema).max(4).optional(),
});

export const dispenseSchema = z.object({
  paymentMethodId: z.number().int().min(1, "Choose how the customer is paying."),
});

export const invoiceSchema = z.object({
  supplierId: z.number().int().positive().nullable().optional(),
  supplierName: z.string().trim().min(2, "Enter the supplier.").max(80),
  invoiceNumber: z.string().trim().min(1, "Enter the invoice number.").max(40),
  amount: z.number().int().min(0, "Amount cannot be negative.").max(50_000_000),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real invoice date."),
  notes: optionalText(200),
  purchaseOrderId: z.number().int().positive().nullable().optional(),
});

export const collectionSchema = z.object({
  saleId: z.number().int().positive(),
  amount: z.number().int().min(1, "Enter the amount collected.").max(50_000_000),
  paymentMethodId: z.number().int().min(1, "Choose how the balance was paid."),
});

const prescriptionLine = z.object({
  drugId: z.number().int().positive(),
  quantity: z.number().int().min(1, "Quantity must be at least 1.").max(5_000),
  dosage: z.string().trim().min(2, "Add directions for each drug.").max(160),
});

export const prescriptionSchema = z.object({
  patientName: z.string().trim().min(2, "Enter the patient name.").max(80),
  patientPhone: optionalText(24),
  doctorName: optionalText(80),
  facility: optionalText(120),
  prescriptionNumber: optionalText(40),
  notes: optionalText(500),
  refillsAllowed: z.number().int().min(0, "Refills cannot be negative.").max(12, "Twelve refills is the limit.").optional().default(0),
  daysSupply: z.number().int().min(0).max(365).optional().default(0),
  photo: z.string().trim().max(900_000, "That photo is too large.").optional(),
  items: z.array(prescriptionLine).min(1, "Add at least one drug.").max(12),
});

const orderLine = z
  .object({
    drugId: z.number().int().positive(),
    quantity: z.number().int().min(1, "Quantity must be at least 1.").max(100_000).optional(),
    packs: z.number().int().min(1, "Enter at least one pack.").max(10_000).optional(),
    unitCost: z.number().int().min(0, "Unit cost cannot be negative.").max(5_000_000),
    expiryDate: z.union([z.literal(""), dateText]).optional().default(""),
    batchNumber: optionalText(40),
  })
  .superRefine((line, ctx) => {
    if (line.quantity == null && line.packs == null) {
      ctx.addIssue({ code: "custom", message: "Enter packs or a base-unit quantity.", path: ["quantity"] });
    }
  });

export const draftUpdateSchema = z.object({
  supplierName: z.string().trim().min(2, "Enter the supplier.").max(80),
  lines: z
    .array(
      z.object({
        drugId: z.number().int().positive(),
        packs: z.number().int().min(1).max(10_000),
      }),
    )
    .min(1, "Keep at least one line, or cancel the draft.")
    .max(40),
});

export const mergeDraftsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(2, "Choose at least two drafts."),
  supplierName: z.string().trim().min(2, "Enter the supplier.").max(80),
});

export const purchaseOrderSchema = z.object({
  supplierName: z.string().trim().min(2, "Enter the supplier.").max(80),
  notes: optionalText(500),
  items: z.array(orderLine).min(1, "Add at least one drug.").max(20),
});

const currencyCode = z
  .string()
  .trim()
  .min(3, "Use a 3-letter currency code.")
  .max(3)
  .transform((value) => value.toUpperCase());

const methodCode = z
  .string()
  .trim()
  .min(2, "Enter a short code.")
  .max(32)
  .transform((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""))
  .refine((value) => value.length >= 2, "Enter a short code.");

export const currencySchema = z.object({
  code: currencyCode,
  name: z.string().trim().min(2, "Enter the currency name.").max(40),
  symbol: z.string().trim().min(1, "Enter a symbol.").max(8),
  isDefault: z.boolean().optional().default(false),
});

export const currencyUpdateSchema = z.object({
  name: z.string().trim().min(2, "Enter the currency name.").max(40),
  symbol: z.string().trim().min(1, "Enter a symbol.").max(8),
  isDefault: z.boolean(),
  active: z.boolean(),
});

export const paymentMethodSchema = z.object({
  code: methodCode,
  name: z.string().trim().min(2, "Enter the method name.").max(40),
  kind: z.enum(["cash", "mobile_money", "card", "credit", "custom"]),
  settlesImmediately: z.boolean().optional().default(true),
});

export const paymentMethodUpdateSchema = z.object({
  name: z.string().trim().min(2, "Enter the method name.").max(40),
  kind: z.enum(["cash", "mobile_money", "card", "credit", "custom"]),
  settlesImmediately: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});

export const businessSchema = z.object({
  name: z.string().trim().min(2, "Enter the pharmacy name.").max(80),
  phone: optionalText(24),
  email: optionalText(80),
  address: optionalText(120),
  receiptPrefix: z
    .string()
    .trim()
    .min(1, "Enter a receipt prefix.")
    .max(8)
    .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "")),
  receiptPadding: z.number().int().min(1).max(8),
  taxRateBps: z.number().int().min(0).max(10_000),
  pricesIncludeTax: z.boolean(),
  defaultDiscountBps: z.number().int().min(0).max(10_000),
  allowLineDiscount: z.boolean(),
  defaultReorderLevel: z.number().int().min(0).max(100_000),
  tin: optionalText(40),
  ebmSerial: optionalText(40),
});

const supplierName = z
  .string()
  .trim()
  .min(2, "Enter the supplier.")
  .max(80, "That supplier name is too long.")
  .transform((value) => value.replace(/\s+/g, " "));

export const supplierSchema = z.object({
  name: supplierName,
});

export const supplierProfileSchema = z.object({
  name: supplierName,
  contactName: optionalText(80),
  phone: optionalText(24),
  email: optionalText(80),
  address: optionalText(160),
  taxNumber: optionalText(40),
  terms: optionalText(160),
  notes: optionalText(500),
  active: z.boolean(),
});

export const patientNotesSchema = z.object({
  notes: optionalText(500),
  sex: z.enum(["", "female", "male"]).optional(),
  dateOfBirth: z.string().trim().max(10).optional(),
  insurerName: z.string().trim().max(80).optional(),
  memberNumber: z.string().trim().max(40).optional(),
  allergies: z.string().trim().max(200).optional(),
  brandPreference: z.enum(["", "any", "generic_only", "brand"]).optional(),
  preferredBrand: z.string().trim().max(80).optional(),
});

const email = z
  .string()
  .trim()
  .min(2, "Enter an email or username.")
  .max(80)
  .refine(
    (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^[a-zA-Z0-9._-]{2,40}$/.test(value),
    "Enter an email or a username.",
  );

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter the password.").max(80),
});

export const staffSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80),
  email,
  password: z.string().min(8, "Use at least 8 characters.").max(80),
  role: z.enum(["admin", "pharmacist", "stock_keeper", "cashier", "dispenser"]),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  phone: z.string().trim().min(7, "Enter a phone number.").max(24),
  email,
  password: z.string().min(8, "Use at least 8 characters.").max(80),
});

export const insurerSchema = z.object({
  name: z.string().trim().min(2, "Enter the insurer.").max(80),
  kind: z.enum(["rssb", "mmi", "mutuelle", "private"]),
  phone: optionalText(40),
  email: optionalText(80),
  address: optionalText(160),
  coverPercent: z.number().int().min(0).max(100),
  period: z.enum(["month", "year", "prescription"]),
  spendingLimit: z.number().int().min(0).max(500_000_000).nullable().optional(),
  limitAction: z.enum(["warn", "block"]),
  stacks: z.boolean().optional().default(false),
  formularyMode: z.enum(["list", "open"]),
  coverOtc: z.boolean().optional().default(false),
  notes: optionalText(500),
  active: z.boolean().optional().default(true),
});

export const coverageRuleSchema = z.object({
  scope: z.enum(["category", "generic", "brand"]),
  name: z.string().trim().min(2, "Enter the category, generic, or brand.").max(80),
  covered: z.boolean(),
  coverPercent: z.number().int().min(0).max(100).nullable().optional(),
});

export const policySchema = z.object({
  insurerId: z.number().int().positive(),
  memberNumber: z.string().trim().min(2, "Enter the member number.").max(40),
  isPrimary: z.boolean().optional().default(true),
});

export const coverageQuoteSchema = z.object({
  memberNumber: optionalText(40),
  acknowledgeRisks: z.boolean().optional().default(false),
  lines: z.array(z.object({
    drugId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(5_000),
    soldAs: z.enum(["base", "strip", "pack"]).optional().default("base"),
  })).min(1).max(20),
});

export function parseBody<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(400, result.error.issues[0]?.message ?? "Check the form and try again.");
  }
  return result.data;
}

export type DrugInput = z.input<typeof drugInputSchema>;
export type DrugUpdateInput = z.input<typeof drugUpdateSchema>;
export type SaleInput = Omit<z.input<typeof saleSchema>, "paymentMethodId"> & { paymentMethodId?: number };
export type PrescriptionInput = z.input<typeof prescriptionSchema>;
export type PurchaseOrderInput = z.input<typeof purchaseOrderSchema>;
