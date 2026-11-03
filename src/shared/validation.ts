import { z } from "zod";

// Every write records where it came from; Giussepe tools write as AGENT.
export const SOURCES = ["WEB", "API", "AGENT", "SYSTEM"] as const;
export type Source = (typeof SOURCES)[number];

// Any UUID version: PostgreSQL generates v4 and fixtures use readable ids.
const uuid = z.guid();
// Explicit offset and a real calendar date (2026-02-30 is rejected).
const instantWithOffset = z.iso.datetime({ offset: true });

export function isId(value: unknown): value is string {
  return uuid.safeParse(value).success;
}

export function parseId(value: unknown, invalid: () => Error) {
  if (!isId(value)) throw invalid();
  return value.toLowerCase();
}

export function parseOneOf<const T extends readonly string[]>(
  values: T,
  value: unknown,
  invalid: () => Error,
): T[number] {
  if (!values.includes(value as T[number])) throw invalid();
  return value as T[number];
}

export function parseInstant(value: unknown, invalid: () => Error) {
  if (!instantWithOffset.safeParse(value).success) throw invalid();
  return new Date(value as string);
}
