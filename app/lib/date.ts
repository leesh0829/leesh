export function toISOStringSafe(value: unknown): string {
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  throw new Error("Invalid date value");
}

export function toISOStringNullable(value: unknown): string | null {
  if (value == null) return null;
  return toISOStringSafe(value);
}