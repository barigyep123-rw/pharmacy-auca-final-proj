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

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email."),
  password: z.string().min(1, "Enter the password.").max(80),
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
