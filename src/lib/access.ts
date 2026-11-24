import { ApiError } from "./errors";
import type { Role } from "./types";

export const roles = ["admin", "pharmacist", "stock_keeper", "cashier", "dispenser"] as const;

export type Area =
  | "dashboard"
  | "inventory"
  | "sales"
  | "prescriptions"
  | "orders"
  | "settings"
  | "deleteDrug"
  | "finance"
  | "reports"
  | "patients"
  | "suppliers"
  | "audit"
  | "drafts";

const matrix: Record<Area, readonly Role[]> = {
  dashboard: ["admin", "pharmacist", "stock_keeper", "cashier", "dispenser"],
  inventory: ["admin", "pharmacist", "stock_keeper"],
  sales: ["admin", "pharmacist", "cashier", "dispenser"],
  prescriptions: ["admin", "pharmacist", "cashier"],
  orders: ["admin", "stock_keeper"],
  settings: ["admin"],
  deleteDrug: ["admin", "stock_keeper"],
  finance: ["admin", "pharmacist", "cashier"],
  reports: ["admin", "pharmacist", "cashier"],
  patients: ["admin", "pharmacist", "cashier", "dispenser"],
  suppliers: ["admin", "stock_keeper", "pharmacist"],
  audit: ["admin"],
  drafts: ["admin", "pharmacist", "stock_keeper"],
};

export function can(role: Role, area: Area) {
  return matrix[area].includes(role);
}

export function assertAccess(role: Role, area: Area) {
  if (!can(role, area)) {
    throw new ApiError(403, "That part of the counter is closed for your role.");
  }
}

export function roleLabel(role: Role) {
  if (role === "stock_keeper") return "Stock keeper";
  if (role === "dispenser") return "Dispenser";
  return role.charAt(0).toUpperCase() + role.slice(1);
}
