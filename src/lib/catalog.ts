export const drugForms = ["tablet", "capsule", "syrup", "sachet", "inhaler", "cream", "drops"] as const;

export const categorySuggestions = [
  "Analgesic",
  "Antibiotic",
  "Antimalarial",
  "Chronic care",
  "Supplement",
  "Gastrointestinal",
  "Respiratory",
  "Antihistamine",
  "Antiparasitic",
  "Dental",
];

export function suggestedOrderQty(quantity: number, reorderLevel: number) {
  return Math.max(reorderLevel * 2 - quantity, reorderLevel, 1);
}

export function wholeNumber(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}
