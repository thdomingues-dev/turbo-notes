const DAY_MS = 86_400_000;

interface DateFormatOptions {
  timeZone?: string;
}

function toDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid note date.");
  return date;
}

function formatterOptions(
  timeZone: string | undefined,
): Pick<Intl.DateTimeFormatOptions, "timeZone"> {
  return timeZone === undefined ? {} : { timeZone };
}

function calendarParts(date: Date, timeZone: string | undefined) {
  const parts = new Intl.DateTimeFormat("en-US", {
    ...formatterOptions(timeZone),
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function calendarOrdinal(date: Date, timeZone: string | undefined): number {
  const { year, month, day } = calendarParts(date, timeZone);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function formatNoteDate(
  value: string | Date,
  now = new Date(),
  options: DateFormatOptions = {},
): string {
  const date = toDate(value);
  const current = toDate(now);
  const daysAgo =
    calendarOrdinal(current, options.timeZone) -
    calendarOrdinal(date, options.timeZone);

  if (daysAgo === 0) return "today";
  if (daysAgo === 1) return "yesterday";

  return new Intl.DateTimeFormat("en-US", {
    ...formatterOptions(options.timeZone),
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatLastEdited(
  value: string | Date,
  options: DateFormatOptions = {},
): string {
  const date = toDate(value);
  const day = new Intl.DateTimeFormat("en-US", {
    ...formatterOptions(options.timeZone),
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    ...formatterOptions(options.timeZone),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${day} at ${time.toLowerCase().replace(" ", "")}`;
}
