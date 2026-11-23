"use client";

import { createContext, useContext } from "react";
import type { Staff } from "@/lib/types";

export const SessionContext = createContext<Staff | null>(null);

export function useStaff() {
  return useContext(SessionContext);
}
