export type ParsedEmbedDatabase =
  | { valid: true; value: string }
  | { valid: false };

const INVALID_DATABASE_CHARACTER = /[\u0000-\u001F\u007F\uFFFD]/u;

export function parseEmbedDatabase(
  searchParams: Pick<URLSearchParams, "getAll">
): ParsedEmbedDatabase {
  const values = searchParams.getAll("database");
  if (values.length !== 1) return { valid: false };

  const value = values[0];
  const length = Array.from(value).length;
  if (
    length === 0 ||
    length > 64 ||
    INVALID_DATABASE_CHARACTER.test(value)
  ) {
    return { valid: false };
  }

  return { valid: true, value };
}
