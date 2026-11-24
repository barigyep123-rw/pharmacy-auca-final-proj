import type { Role } from "./types";

export const exampleStaff: Array<{ name: string; email: string; role: Exclude<Role, "admin"> }> = [
  { name: "Jean Habimana", email: "jean@ubuzima.rw", role: "pharmacist" },
  { name: "Claudine Ingabire", email: "claudine@ubuzima.rw", role: "stock_keeper" },
  { name: "Eric Ndayisaba", email: "eric@ubuzima.rw", role: "cashier" },
  { name: "Aline Uwimana", email: "dispense@ubuzima.rw", role: "dispenser" },
];
