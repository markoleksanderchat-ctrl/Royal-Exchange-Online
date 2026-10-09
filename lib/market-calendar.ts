export const MARKET_TIME_ZONE = "America/New_York";
const MINUTE = 60_000;
const DAY = 86_400_000;
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export type ExchangeSession = { day: string; opensAt: number; closesAt: number };
export type ExchangeCalendar = {
  open: boolean; session: ExchangeSession; nextOpeningAt: number; nextEventAt: number;
  nextClearingAt: number; progress: number;
};
export type CalendarOverrides = { closedDates?: string[]; earlyCloses?: Record<string, string> };

function parts(at: number) {
  return Object.fromEntries(formatter.formatToParts(new Date(at))
    .filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
}
export function easternDay(at: number | Date) {
  const value = parts(at instanceof Date ? at.getTime() : at);
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}
export function easternInstant(day: string, hour: number, minute = 0) {
  const [year, month, date] = day.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, date, hour, minute);
  const offset = (at: number) => { const p = parts(at); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at; };
  const estimate = desired - offset(desired);
  return desired - offset(estimate);
}
function addDays(day: string, offset: number) { return new Date(Date.parse(day + "T12:00:00Z") + offset * DAY).toISOString().slice(0, 10); }
function weekday(day: string) { return new Date(day + "T12:00:00Z").getUTCDay(); }
function nth(year: number, month: number, day: number, count: number) {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  return addDays(first, (day - weekday(first) + 7) % 7 + (count - 1) * 7);
}
function observed(day: string) { return addDays(day, weekday(day) === 6 ? -1 : weekday(day) === 0 ? 1 : 0); }
function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451), value = h + l - 7 * m + 114;
  return `${year}-${String(Math.floor(value / 31)).padStart(2, "0")}-${String(value % 31 + 1).padStart(2, "0")}`;
}
export function sessionFor(day: string, overrides: CalendarOverrides = {}): ExchangeSession | null {
  const year = Number(day.slice(0, 4)), weekDay = weekday(day);
  const newYear = `${year}-01-01`;
  const holidays = new Set([
    ...(weekday(newYear) === 6 ? [] : [observed(newYear)]),
    ...(year >= 1998 ? [nth(year, 1, 1, 3)] : []), nth(year, 2, 1, 3), addDays(easter(year), -2),
    addDays(`${year}-05-31`, -((weekday(`${year}-05-31`) + 6) % 7)),
    ...(year >= 2022 ? [observed(`${year}-06-19`)] : []), observed(`${year}-07-04`),
    nth(year, 9, 1, 1), nth(year, 11, 4, 4), observed(`${year}-12-25`),
  ]);
  if (weekDay === 0 || weekDay === 6 || holidays.has(day) || overrides.closedDates?.includes(day)) return null;
  const early = day === addDays(nth(year, 11, 4, 4), 1) || day.endsWith("-12-24") || day.endsWith("-07-03");
  const close = overrides.earlyCloses?.[day] ?? (early ? "13:00" : "16:00");
  if (!/^\d\d:\d\d$/.test(close) || close <= "09:30" || close > "16:00") throw new Error("Invalid exchange closing time");
  const [hour, minute] = close.split(":").map(Number);
  if (minute > 59) throw new Error("Invalid exchange closing time");
  return { day, opensAt: easternInstant(day, 9, 30), closesAt: easternInstant(day, hour, minute) };
}
export function exchangeCalendar(at: number | Date, overrides: CalendarOverrides = {}): ExchangeCalendar {
  const now = at instanceof Date ? at.getTime() : at, today = easternDay(now);
  let last: ExchangeSession | null = null, next: ExchangeSession | null = null;
  const horizon = 370 + (overrides.closedDates?.length ?? 0) * 2;
  for (let offset = 0; !last && offset < horizon; offset++) {
    const session = sessionFor(addDays(today, -offset), overrides);
    if (session && session.opensAt <= now) last = session;
  }
  for (let offset = 0; !next && offset < horizon; offset++) {
    const session = sessionFor(addDays(today, offset), overrides);
    if (session && session.opensAt > now) next = session;
  }
  if (!last || !next) throw new Error("No scheduled exchange session");
  const open = last.day === today && now >= last.opensAt && now < last.closesAt;
  return { open, session: last, nextOpeningAt: next.opensAt, nextEventAt: open ? last.closesAt : next.opensAt,
    nextClearingAt: open ? Math.min((Math.floor(now / (5 * MINUTE)) + 1) * 5 * MINUTE, last.closesAt) : next.opensAt,
    progress: open ? Math.max(0, Math.min(1, (now - last.opensAt) / (last.closesAt - last.opensAt))) : 0 };
}
