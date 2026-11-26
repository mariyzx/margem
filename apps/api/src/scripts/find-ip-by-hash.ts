/**
 * Finds which IP (or IPv6 /64) produced an `ipHash`, during an abuse investigation.
 *
 * It calls the API's own `clientFingerprint()`, so the IP normalization (IPv4-mapped
 * IPv6, the /64 for IPv6) can never drift from what the API logged. Run it inside the
 * API container, where LOG_HASH_SECRET is set:
 *
 *   dc exec -T api node apps/api/dist/scripts/find-ip-by-hash.js <ipHash> < faixas.txt
 *
 * Input, one per line: IPv4 addresses or ranges as the Caddy access log shows them
 * (`203.0.113.0`, masked to /24) or in CIDR (`203.0.113.0/24`); IPv6 addresses or /64s.
 * Every IPv4 line is expanded to its 256 addresses. See infra/docs/investigar-abuso.md.
 */
import { readFileSync } from "node:fs";
import { isIPv4, isIPv6 } from "node:net";
import { clientFingerprint, normalizeIpForFingerprint } from "../security/client-fingerprint";

const IP_HASH_PATTERN = /^[0-9a-f]{16}$/;

export interface FindIpResult {
  /** IPv4 addresses or IPv6 /64s whose ipHash equals the target. */
  matches: string[];
  /** How many distinct candidates were hashed. */
  tested: number;
  /** Input lines that are not an IP or range, reported instead of silently skipped. */
  invalid: string[];
}

function candidatesFor(line: string): string[] | null {
  const [address = "", prefix] = line.split("/");
  const plain = address.replace(/^::ffff:/i, "");

  if (isIPv4(plain)) {
    if (prefix !== undefined && prefix !== "24" && prefix !== "32") return null;
    if (prefix === "32") return [plain];
    const base = plain.split(".").slice(0, 3).join(".");
    return Array.from({ length: 256 }, (_, i) => `${base}.${i}`);
  }
  if (isIPv6(address)) {
    if (prefix !== undefined && prefix !== "64" && prefix !== "128") return null;
    return [address];
  }
  return null;
}

export function findIpsByHash(targetHash: string, lines: string[]): FindIpResult {
  const target = targetHash.trim().toLowerCase();
  if (!IP_HASH_PATTERN.test(target)) {
    throw new Error(`"${targetHash}" is not an ipHash (16 hex characters)`);
  }

  const seen = new Set<string>();
  const matches = new Set<string>();
  const invalid: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const candidates = candidatesFor(line);
    if (!candidates) {
      invalid.push(line);
      continue;
    }
    for (const ip of candidates) {
      // Same key the API hashes: IPv6 collapses to its /64, so test each /64 once.
      const key = normalizeIpForFingerprint(ip);
      if (seen.has(key)) continue;
      seen.add(key);
      if (clientFingerprint({ ip, headers: {} }).ipHash === target) {
        matches.add(key);
      }
    }
  }

  return { matches: [...matches], tested: seen.size, invalid };
}

function main(): void {
  const [targetHash] = process.argv.slice(2);
  if (!targetHash) {
    process.stderr.write("usage: find-ip-by-hash <ipHash> < candidates.txt\n");
    process.exit(2);
  }

  const lines = readFileSync(0, "utf8").split("\n");
  const result = findIpsByHash(targetHash, lines);

  for (const line of result.invalid) {
    process.stderr.write(`ignored (not an IP or /24, /64 range): ${line}\n`);
  }
  for (const match of result.matches) {
    process.stdout.write(`${match}\n`);
  }
  process.stderr.write(`${result.tested} candidates tested, ${result.matches.length} match(es)\n`);

  if (result.matches.length === 0) {
    process.stderr.write(
      "no match: widen the time window of the ranges, check that this container has the\n" +
        "same LOG_HASH_SECRET that produced the hash, and see the IPv6 note in the runbook.\n",
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
