const pluralRules = new Intl.PluralRules();

export interface CountNoun {
  one: string;
  other: string;
}

export function pluralize(count: number, one: string, other = `${one}s`): string {
  return pluralRules.select(count) === "one" ? one : other;
}

export function formatCount(count: number, one: string, other = `${one}s`): string {
  return `${new Intl.NumberFormat().format(count)} ${pluralize(count, one, other)}`;
}

export function formatCountLabel(count: number, noun: CountNoun): string {
  return `${new Intl.NumberFormat().format(count)} ${
    pluralRules.select(count) === "one" ? noun.one : noun.other
  }`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }

  if (seconds < 60) {
    return `${Math.round(seconds)} sec`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds ? `${minutes} min ${remainingSeconds} sec` : `${minutes} min`;
}

export function formatPercentage(value: number | null | undefined, hasData = true): string {
  if (!hasData || value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return `${Math.round(value)}%`;
}

export function formatCompactDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
