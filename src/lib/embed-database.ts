export type ParsedEmbedDatabase =
  | { valid: true; value: string }
  | { valid: false };

function hasInvalidDatabaseCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint === undefined ||
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      codePoint === 0xfffd
    );
  });
}

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
    hasInvalidDatabaseCharacter(value)
  ) {
    return { valid: false };
  }

  return { valid: true, value };
}
