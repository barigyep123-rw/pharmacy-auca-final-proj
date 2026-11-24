import { ApiError } from "./errors";

export const strengthUnits = ["mg", "g", "mcg", "ml", "L", "IU", "%"] as const;

const aliases: Record<string, (typeof strengthUnits)[number]> = {
  mg: "mg",
  g: "g",
  mcg: "mcg",
  ug: "mcg",
  ml: "ml",
  l: "L",
  iu: "IU",
  "%": "%",
};

export function splitStrength(strength: string): { value: string; unit: string } {
  const match = strength.trim().match(/^(\d+(?:\.\d+)?)(?:\s*)([a-zA-Z%]+)?$/);
  if (!match) return { value: "", unit: "mg" };
  const unit = aliases[(match[2] ?? "mg").toLowerCase()] ?? "mg";
  return { value: match[1], unit };
}

export function shapeStrength(input: { strength?: string; strengthValue?: string; strengthUnit?: string }) {
  const value = (input.strengthValue ?? "").trim();
  const unit = (input.strengthUnit ?? "").trim() || "mg";
  if (value) {
    if (!/^\d+(?:\.\d+)?$/.test(value)) throw new ApiError(400, "Strength is a number, such as 200.");
    if (!strengthUnits.includes(unit as (typeof strengthUnits)[number])) {
      throw new ApiError(400, "Choose a strength unit, such as mg or ml.");
    }
    return { strength: `${value} ${unit}`, value, unit };
  }
  const existing = (input.strength ?? "").trim();
  const split = splitStrength(existing);
  return { strength: existing, value: split.value, unit: split.value ? split.unit : "" };
}

export function unitsFromOpeningPacks(quantity: number, packs: number) {
  if (quantity < 1 || packs < 1 || quantity % packs !== 0) return null;
  return quantity / packs;
}
