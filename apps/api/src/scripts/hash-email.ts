/**
 * Prints the `emailHash` the API stores in AuditLog for an address, to look up a known
 * e-mail (e.g. someone who reported spam). Same helper as the API, so it always matches.
 *
 *   dc exec -T api node apps/api/dist/scripts/hash-email.js "pessoa@exemplo.com"
 */
import { hashEmailForLogs } from "../security/client-fingerprint";

if (require.main === module) {
  const [email] = process.argv.slice(2);
  if (!email || !email.includes("@")) {
    process.stderr.write("usage: hash-email <email>\n");
    process.exit(2);
  }
  process.stdout.write(`${hashEmailForLogs(email)}\n`);
}
