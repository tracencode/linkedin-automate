import type { Cadence, Weekday } from "../config.ts";

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  dateLocal: string;
};

export function zonedParts(now: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((part) => [part.type, part.value]),
  );

  const weekdayName = (parts.weekday ?? "Mon").slice(0, 3);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  return {
    year,
    month,
    day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[weekdayName] ?? 1,
    dateLocal: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export function isScheduledDay(cadence: Cadence, weekday: number, weeklyDay: Weekday): boolean {
  if (cadence === "daily") return true;
  if (cadence === "weekdays") return weekday >= 1 && weekday <= 5;
  if (cadence === "3x") return weekday === 2 || weekday === 3 || weekday === 4;
  return weekday === WEEKDAY_INDEX[weeklyDay];
}

export function shouldRunNow(opts: {
  now?: Date;
  timeZone: string;
  cadence: Cadence;
  hour: number;
  minute: number;
  weekday: Weekday;
  lastPostedLocalDate?: string;
}): { run: boolean; reason: string; dateLocal: string } {
  const parts = zonedParts(opts.now ?? new Date(), opts.timeZone);

  if (opts.lastPostedLocalDate === parts.dateLocal) {
    return { run: false, reason: `Already posted today (${parts.dateLocal})`, dateLocal: parts.dateLocal };
  }

  if (!isScheduledDay(opts.cadence, parts.weekday, opts.weekday)) {
    return { run: false, reason: `Not a posting day for cadence "${opts.cadence}"`, dateLocal: parts.dateLocal };
  }

  const minutesNow = parts.hour * 60 + parts.minute;
  const minutesTarget = opts.hour * 60 + opts.minute;
  if (minutesNow < minutesTarget) {
    return {
      run: false,
      reason: `Waiting until ${pad(opts.hour)}:${pad(opts.minute)} ${opts.timeZone}`,
      dateLocal: parts.dateLocal,
    };
  }

  return { run: true, reason: `Scheduled window open (${parts.dateLocal})`, dateLocal: parts.dateLocal };
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type ScheduleSlot = {
  dateLocal: string;
  weekday: string;
  time: string;
  timezone: string;
  label: string;
  windowOpen: boolean;
};

export function weekdayOfLocalDate(dateLocal: string): number {
  const [year, month, day] = parseLocalDate(dateLocal);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addLocalDays(dateLocal: string, days: number): string {
  const [year, month, day] = parseLocalDate(dateLocal);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function formatScheduleLabel(dateLocal: string, hour: number, minute: number, timeZone: string): string {
  const [year, month, day] = parseLocalDate(dateLocal);
  const weekday = WEEKDAY_NAMES[weekdayOfLocalDate(dateLocal)] ?? "";
  const monthName = MONTHS[month - 1] ?? "";
  return `${weekday.slice(0, 3)} ${day} ${monthName} ${year}, ${pad(hour)}:${pad(minute)} ${timeZone}`;
}

function parseLocalDate(dateLocal: string): [number, number, number] {
  const [year, month, day] = dateLocal.split("-").map(Number);
  return [year ?? 1970, month ?? 1, day ?? 1];
}

export function listUpcomingSlots(opts: {
  count: number;
  timeZone: string;
  cadence: Cadence;
  hour: number;
  minute: number;
  weekday: Weekday;
  lastPostedLocalDate?: string;
  now?: Date;
}): ScheduleSlot[] {
  const count = Math.max(0, opts.count);
  if (count === 0) return [];

  const parts = zonedParts(opts.now ?? new Date(), opts.timeZone);
  const postedToday = opts.lastPostedLocalDate === parts.dateLocal;
  const slots: ScheduleSlot[] = [];
  let date = parts.dateLocal;
  let guard = 0;

  while (slots.length < count && guard < 400) {
    guard += 1;
    const weekday = weekdayOfLocalDate(date);
    const scheduled = isScheduledDay(opts.cadence, weekday, opts.weekday);
    const isToday = date === parts.dateLocal;
    if (scheduled && !(isToday && postedToday)) {
      const windowOpen =
        isToday &&
        parts.hour * 60 + parts.minute >= opts.hour * 60 + opts.minute;
      const label = formatScheduleLabel(date, opts.hour, opts.minute, opts.timeZone);
      slots.push({
        dateLocal: date,
        weekday: WEEKDAY_NAMES[weekday] ?? "",
        time: `${pad(opts.hour)}:${pad(opts.minute)}`,
        timezone: opts.timeZone,
        label: windowOpen ? `${label} · window open` : label,
        windowOpen,
      });
    }
    date = addLocalDays(date, 1);
  }
  return slots;
}

export function describeNextPost(opts: {
  timeZone: string;
  cadence: Cadence;
  hour: number;
  minute: number;
  weekday: Weekday;
  lastPostedLocalDate?: string;
}): string {
  const next = listUpcomingSlots({ ...opts, count: 1 })[0];
  return next?.label ?? `${pad(opts.hour)}:${pad(opts.minute)} ${opts.timeZone}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
