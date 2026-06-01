const TIME_ZONE = "America/Chicago";

function chicagoParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  };
}

export function getDayId(date = new Date()) {
  const { year, month, day } = chicagoParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getWeekId(date = new Date()) {
  const { year, month, day, weekday } = chicagoParts(date);
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const daysSinceMonday = weekdayIndex === 0 ? 6 : weekdayIndex - 1;
  const chicagoNoonUtc = new Date(Date.UTC(year, month - 1, day, 18));
  chicagoNoonUtc.setUTCDate(chicagoNoonUtc.getUTCDate() - daysSinceMonday);
  const monday = chicagoParts(chicagoNoonUtc);
  return `${monday.year}-W${String(monday.month).padStart(2, "0")}-${String(monday.day).padStart(2, "0")}`;
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
