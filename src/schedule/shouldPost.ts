import type { Cadence, PostTime, Weekday } from "../config.ts";

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

function minutesOf(time: PostTime): number {
  return time.hour * 60 + time.minute;
}

/** How many of today's slots are already open (time has passed). */
export function openSlotsToday(times: PostTime[], hour: number, minute: number): number {
  const now = hour * 60 + minute;
  return times.filter((time) => now >= minutesOf(time)).length;
}

export function shouldRunNow(opts: {
  now?: Date;
  timeZone: string;
  cadence: Cadence;
  times: PostTime[];
  /** @deprecated prefer times[0] — kept for callers still passing hour/minute */
  hour?: number;
  minute?: number;
  weekday: Weekday;
  postedTodayCount?: number;
  lastPostedLocalDate?: string;
}): { run: boolean; reason: string; dateLocal: string } {
  const parts = zonedParts(opts.now ?? new Date(), opts.timeZone);
  const times =
    opts.times?.length > 0
      ? opts.times
      : [{ hour: opts.hour ?? 9, minute: opts.minute ?? 15 }];

  const postedCount =
    opts.postedTodayCount ??
    (opts.lastPostedLocalDate === parts.dateLocal ? 1 : 0);

  if (!isScheduledDay(opts.cadence, parts.weekday, opts.weekday)) {
    return { run: false, reason: `Not a posting day for cadence "${opts.cadence}"`, dateLocal: parts.dateLocal };
  }

  if (postedCount >= times.length) {
    return {
      run: false,
      reason: `Daily quota filled (${postedCount}/${times.length} on ${parts.dateLocal})`,
      dateLocal: parts.dateLocal,
    };
  }

  const open = openSlotsToday(times, parts.hour, parts.minute);
  if (postedCount >= open) {
    const next = times[postedCount];
    const when = next
      ? `Waiting until ${pad(next.hour)}:${pad(next.minute)} ${opts.timeZone}`
      : `Waiting for next slot (${opts.timeZone})`;
    return { run: false, reason: when, dateLocal: parts.dateLocal };
  }

  return {
    run: true,
    reason: `Scheduled slot ${postedCount + 1}/${times.length} open (${parts.dateLocal})`,
    dateLocal: parts.dateLocal,
  };
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
  times: PostTime[];
  hour?: number;
  minute?: number;
  weekday: Weekday;
  postedTodayCount?: number;
  lastPostedLocalDate?: string;
  now?: Date;
}): ScheduleSlot[] {
  const count = Math.max(0, opts.count);
  if (count === 0) return [];

  const times =
    opts.times?.length > 0
      ? opts.times
      : [{ hour: opts.hour ?? 9, minute: opts.minute ?? 15 }];

  const parts = zonedParts(opts.now ?? new Date(), opts.timeZone);
  let remainingToday =
    opts.postedTodayCount ??
    (opts.lastPostedLocalDate === parts.dateLocal ? 1 : 0);

  const slots: ScheduleSlot[] = [];
  let date = parts.dateLocal;
  let guard = 0;

  while (slots.length < count && guard < 800) {
    guard += 1;
    const weekday = weekdayOfLocalDate(date);
    const scheduled = isScheduledDay(opts.cadence, weekday, opts.weekday);
    const isToday = date === parts.dateLocal;

    if (scheduled) {
      for (let i = 0; i < times.length && slots.length < count; i += 1) {
        const time = times[i]!;
        if (isToday && i < remainingToday) continue;
        const windowOpen =
          isToday &&
          parts.hour * 60 + parts.minute >= minutesOf(time) &&
          (i === remainingToday || (i >= remainingToday && slots.length === 0));
        const label = formatScheduleLabel(date, time.hour, time.minute, opts.timeZone);
        slots.push({
          dateLocal: date,
          weekday: WEEKDAY_NAMES[weekday] ?? "",
          time: `${pad(time.hour)}:${pad(time.minute)}`,
          timezone: opts.timeZone,
          label: windowOpen ? `${label} · window open` : label,
          windowOpen,
        });
      }
      if (isToday) remainingToday = times.length;
    }
    date = addLocalDays(date, 1);
  }
  return slots;
}

export function describeNextPost(opts: {
  timeZone: string;
  cadence: Cadence;
  times: PostTime[];
  hour?: number;
  minute?: number;
  weekday: Weekday;
  postedTodayCount?: number;
  lastPostedLocalDate?: string;
}): string {
  const next = listUpcomingSlots({ ...opts, count: 1 })[0];
  const times =
    opts.times?.length > 0
      ? opts.times
      : [{ hour: opts.hour ?? 9, minute: opts.minute ?? 15 }];
  const first = times[0]!;
  return next?.label ?? `${pad(first.hour)}:${pad(first.minute)} ${opts.timeZone}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
