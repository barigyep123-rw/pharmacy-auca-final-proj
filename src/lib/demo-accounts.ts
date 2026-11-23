import type { Role } from "./types";

export const demoAccounts: Array<{
  name: string;
  email: string;
  password: string;
  role: Role;
  title: string;
  hint: string;
}> = [
  {
    name: "Amina Uwase",
    email: "amina@apotheka.rw",
    password: "pine-ledger",
    role: "admin",
    title: "Admin",
    hint: "Changes shelf prices and removes drugs",
  },
  {
    name: "Jean Habimana",
    email: "jean@apotheka.rw",
    password: "counter-key",
    role: "pharmacist",
    title: "Pharmacist",
    hint: "Sells, dispenses, and receives supplier orders",
  },
];
