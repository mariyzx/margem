export function buildCsp(
  nonce: string,
  isDev: boolean,
  apiUrl = "http://localhost:3001",
  sentryDsn?: string,
): string {
  const apiOrigin = new URL(apiUrl).origin;
  const connectSources = ["'self'", apiOrigin];

  if (sentryDsn) {
    try {
      connectSources.push(new URL(sentryDsn).origin);
    } catch {
      // ignora DSN malformado
    }
  }

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
