export type Role = "admin" | "pharmacist";

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
  form: string;
  strength: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  reorderLevel: number;
  expiryDate: string;
  batchNumber: string;
  supplier: string;
  onOrder: number;
  low: boolean;
  expired: boolean;
  expiringSoon: boolean;
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

export type Prescription = {
  id: number;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  notes: string;
  status: "pending" | "dispensed" | "cancelled";
  createdByName: string;
  dispensedByName: string | null;
  dispensedAt: string | null;
  createdAt: string;
  items: PrescriptionItem[];
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
  status: "ordered" | "received" | "cancelled";
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
