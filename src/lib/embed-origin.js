/**
 * Shared by Next CSP and the browser. Require canonical HTTP(S) origins so
 * URL normalization cannot make their policies disagree.
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
function parseEmbedOrigin(value) {
  if (value === undefined || value === "") return undefined;
  try {
    const url = new URL(value);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin === value &&
      !url.hostname.includes("*")
    )
      return value;
  } catch {
    // Never echo potentially sensitive configuration values.
  }
  throw new Error(
    "NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN must be one exact HTTP(S) origin, " +
      "for example https://panel.example.com (no trailing slash, path, credentials, query, fragment or wildcard)."
  );
}

module.exports = { parseEmbedOrigin };
