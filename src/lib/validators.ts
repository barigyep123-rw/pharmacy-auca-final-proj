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
  genericName: optionalText(80),
  category: z.string().trim().min(2, "Enter a category.").max(40),
  form: z.string().trim().min(2, "Choose a form.").max(24),
  strength: optionalText(40),
  sku,
  unitPrice: z.number().int().min(0, "Price cannot be negative.").max(5_000_000),
  openingQuantity: z.number().int().min(0).max(100_000),
  reorderLevel: z.number().int().min(0).max(100_000),
  expiryDate: dateText,
  batchNumber: optionalText(40),
  supplier: optionalText(80),
});

export const drugUpdateSchema = drugInputSchema.omit({ openingQuantity: true });

export const saleSchema = z.object({
  drugId: z.number().int().positive(),
  quantity: z.number().int().min(1, "Quantity must be at least 1.").max(5_000),
  customerName: optionalText(80),
  paymentMethodId: z.number().int().min(1, "Choose how the customer is paying."),
});

export const dispenseSchema = z.object({
  paymentMethodId: z.number().int().min(1, "Choose how the customer is paying."),
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
  notes: optionalText(500),
  items: z.array(prescriptionLine).min(1, "Add at least one drug.").max(12),
});

const orderLine = z.object({
  drugId: z.number().int().positive(),
  quantity: z.number().int().min(1, "Quantity must be at least 1.").max(10_000),
  unitCost: z.number().int().min(0, "Unit cost cannot be negative.").max(5_000_000),
  expiryDate: z.union([z.literal(""), dateText]).optional().default(""),
  batchNumber: optionalText(40),
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
});

export const supplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter the supplier.")
    .max(80, "That supplier name is too long.")
    .transform((value) => value.replace(/\s+/g, " ")),
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
  role: z.enum(["admin", "pharmacist", "stock_keeper", "cashier"]),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  phone: z.string().trim().min(7, "Enter a phone number.").max(24),
  email,
  password: z.string().min(8, "Use at least 8 characters.").max(80),
});

export function parseBody<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(400, result.error.issues[0]?.message ?? "Check the form and try again.");
  }
  return result.data;
}

export type DrugInput = z.infer<typeof drugInputSchema>;
export type DrugUpdateInput = z.infer<typeof drugUpdateSchema>;
export type SaleInput = z.infer<typeof saleSchema>;
export type PrescriptionInput = z.infer<typeof prescriptionSchema>;
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
