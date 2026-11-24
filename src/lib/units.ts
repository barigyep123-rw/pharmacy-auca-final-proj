export type PackRule = { baseUnit: string; packUnit: string; unitsPerPack: number };

export function packForForm(form: string): PackRule {
  if (form === "sachet") return { baseUnit: "sachet", packUnit: "box", unitsPerPack: 10 };
  if (form === "syrup" || form === "drops") return { baseUnit: "bottle", packUnit: "carton", unitsPerPack: form === "syrup" ? 12 : 1 };
  if (form === "inhaler") return { baseUnit: "inhaler", packUnit: "carton", unitsPerPack: 1 };
  if (form === "cream") return { baseUnit: "tube", packUnit: "box", unitsPerPack: 1 };
  if (form === "capsule") return { baseUnit: "capsule", packUnit: "box", unitsPerPack: 10 };
  return { baseUnit: "tablet", packUnit: "box", unitsPerPack: 10 };
}

export function baseCount(count: number, soldAs: "base" | "pack", unitsPerPack: number) {
  const per = unitsPerPack >= 1 ? unitsPerPack : 1;
  return soldAs === "pack" ? count * per : count;
}

export function packsForShortfall(onHand: number, reorderLevel: number, unitsPerPack: number) {
  const per = unitsPerPack >= 1 ? unitsPerPack : 1;
  const gap = reorderLevel - onHand;
  const needed = gap <= 0 ? per : gap;
  return Math.ceil(needed / per) * per;
}

export function unitLabel(count: number, unit: string) {
  if (count === 1) return `1 ${unit}`;
  if (unit === "box") return `${count} boxes`;
  if (unit.endsWith("s")) return `${count} ${unit}`;
  return `${count} ${unit}s`;
}

export function describeStock(quantity: number, unitsPerPack: number, baseUnit: string, packUnit: string) {
  const per = unitsPerPack >= 1 ? unitsPerPack : 1;
  const base = unitLabel(quantity, baseUnit);
  if (per === 1) return base;
  const packs = Math.floor(quantity / per);
  const loose = quantity % per;
  if (packs === 0) return base;
  if (loose === 0) return `${unitLabel(packs, packUnit)} (${base})`;
  return `${unitLabel(packs, packUnit)} + ${unitLabel(loose, baseUnit)}`;
}
