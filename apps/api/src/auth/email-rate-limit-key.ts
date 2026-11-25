const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Collapses common aliases of the same mailbox so they share one rate-limit bucket.
 * Used ONLY to build rate-limit keys: the address stored and mailed stays as typed.
 *
 * - lowercase and trim;
 * - drop a "+suffix" from the local part;
 * - on gmail.com / googlemail.com, drop dots and unify the domain to gmail.com.
 */
export function normalizeEmailForRateLimit(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0) {
    return lower;
  }

  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);

  const plus = local.indexOf("+");
  if (plus >= 0) {
    local = local.slice(0, plus);
  }

  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replaceAll(".", "");
    domain = "gmail.com";
  }

  return `${local}@${domain}`;
}
