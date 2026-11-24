export type Role = "admin" | "pharmacist" | "stock_keeper" | "cashier" | "dispenser";

export type Staff = {
  id: number;
  name: string;
  email: string;
  role: Role;
};

export type Drug = {
  id: number;
  name: string;
  genericName: string;
  category: string;
  categoryId: number | null;
  subcategoryId: number | null;
  subcategory: string;
  genericId: number | null;
  variantId: number | null;
  brandName: string;
  manufacturer: string;
  barcode: string;
  rxOnly: boolean;
  stripSize: number;
  stripPrice: number;
  packPrice: number;
  form: string;
  strength: string;
  strengthValue: string;
  strengthUnit: string;
  description: string;
  originCountry: string;
  rssbCover: number | null;
  mutuelleCover: number | null;
  sku: string;
  unitPrice: number;
  quantity: number;
  reorderLevel: number;
  baseUnit: string;
  packUnit: string;
  unitsPerPack: number;
  allocated: number;
  expiryDate: string;
  batchNumber: string;
  supplier: string;
  onOrder: number;
  low: boolean;
  expired: boolean;
  expiringSoon: boolean;
  hasPhoto: boolean;
  photoCount: number;
};

export type Movement = {
  kind: "sale" | "receipt";
  quantity: number;
  at: string;
  detail: string;
};

export type Sale = {
  id: number;
  drugId: number;
  drugName: string;
  strength: string;
  quantity: number;
  unitPrice: number;
  total: number;
  customerName: string;
  sellerName: string;
  prescriptionId: number | null;
  createdAt: string;
  receiptNumber: string;
  paymentMethodName: string;
  settlesImmediately: boolean;
  directions: string;
  lotLabel: string;
  basketId: number | null;
  fiscalCode: string;
};

export type ReceiptLine = {
  name: string;
  strength: string;
  quantity: number;
  unitPrice: number;
  total: number;
  directions?: string;
  lotLabel?: string;
};

export type PaymentReceipt = {
  numbers: string[];
  issuedAt: string;
  customerName: string;
  sellerName: string;
  paymentMethodName: string;
  settlesImmediately: boolean;
  lines: ReceiptLine[];
  fiscalNote?: string;
};

export type PrescriptionItem = {
  id: number;
  drugId: number;
  drugName: string;
  strength: string;
  quantity: number;
  dosage: string;
  unitPrice: number;
  onHand: number;
  expiryDate: string;
};

export type PrescriptionFill = {
  id: number;
  fillNumber: number;
  dispensedByName: string;
  createdAt: string;
};

export type Prescription = {
  id: number;
  patientId: number | null;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  facility: string;
  prescriptionNumber: string;
  hasPhoto: boolean;
  notes: string;
  status: "pending" | "dispensed" | "cancelled";
  refillsAllowed: number;
  fillsUsed: number;
  refillsRemaining: number;
  createdByName: string;
  dispensedByName: string | null;
  dispensedAt: string | null;
  createdAt: string;
  items: PrescriptionItem[];
  fills: PrescriptionFill[];
};

export type PurchaseItem = {
  id: number;
  drugId: number;
  drugName: string;
  strength: string;
  quantity: number;
  unitCost: number;
  expiryDate: string | null;
  batchNumber: string;
  lineTotal: number;
};

export type PurchaseOrder = {
  id: number;
  supplierName: string;
  status: "draft" | "ordered" | "received" | "cancelled";
  notes: string;
  orderedByName: string;
  receivedByName: string | null;
  orderedAt: string;
  receivedAt: string | null;
  items: PurchaseItem[];
  totalCost: number;
};

export type DashboardData = {
  totalDrugs: number;
  totalUnits: number;
  lowStock: number;
  expiringSoon: number;
  expired: number;
  openOrderCount: number;
  openOrderUnits: number;
  todaySales: { count: number; total: number };
  recentPrescriptionCount: number;
  pendingPrescriptions: number;
  attention: Array<{
    id: number;
    name: string;
    strength: string;
    quantity: number;
    reorderLevel: number;
    expiryDate: string;
    onOrder: number;
    low: boolean;
    expired: boolean;
    expiringSoon: boolean;
  }>;
  recentPrescriptions: Array<{
    id: number;
    patientName: string;
    status: Prescription["status"];
    createdAt: string;
    itemCount: number;
  }>;
  showInventory: boolean;
  showSales: boolean;
  showPrescriptions: boolean;
  showOrders: boolean;
  recentSales: Array<{
    id: number;
    drugName: string;
    strength: string;
    quantity: number;
    total: number;
    customerName: string;
    prescriptionId: number | null;
    createdAt: string;
  }>;
};
