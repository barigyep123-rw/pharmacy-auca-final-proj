const ZONE = "Africa/Kigali";

export function kigaliToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function kigaliHour(now = new Date()): number {
  const value = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(now);
  return Number(value);
}

export function greeting(now = new Date()): string {
  const hour = kigaliHour(now);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function kigaliLongDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
}
