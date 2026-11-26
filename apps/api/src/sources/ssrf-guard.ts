import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export const LINK_FETCH_TIMEOUT_MS = 10_000;
export const LINK_FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const LINK_FETCH_MAX_REDIRECTS = 3;

const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/xhtml+xml"];

export type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = parts as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 (private)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (private)
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (private)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24
  if (a >= 224) return true; // multicast + reserved (224.0.0.0/4, 240.0.0.0/4)

  return false;
}

export function isBlockedIp(rawIp: string): boolean {
  const ip =
    rawIp
      .replace(/^\[|\]$/g, "")
      .split("%")[0]
      ?.toLowerCase() ?? "";
  const version = isIP(ip);
  if (version === 4) {
    return isBlockedIpv4(ip);
  }
  if (version !== 6) {
    return true;
  }

  if (ip === "::" || ip === "::1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // fc00::/7 (unique local)
  if (
    ip.startsWith("fe8") ||
    ip.startsWith("fe9") ||
    ip.startsWith("fea") ||
    ip.startsWith("feb")
  ) {
    return true; // fe80::/10 (link-local)
  }
  if (ip.startsWith("ff")) return true; // ff00::/8 (multicast)

  if (ip.startsWith("::ffff:")) {
    const mapped = ip.slice("::ffff:".length);
    if (isIP(mapped) === 4) {
      return isBlockedIpv4(mapped);
    }
    const hexParts = mapped.split(":");
    if (hexParts.length === 2) {
      const hi = Number.parseInt(hexParts[0] ?? "", 16);
      const lo = Number.parseInt(hexParts[1] ?? "", 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isBlockedIpv4(ipv4);
      }
    }
    return true;
  }

  return false;
}

export interface ValidatedTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

const defaultLookup: DnsLookupFn = (hostname) => lookup(hostname, { all: true });

export async function resolveAndValidateUrl(
  rawUrl: string,
  lookupFn: DnsLookupFn = defaultLookup,
): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError("Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new SsrfBlockedError("URLs with embedded credentials are not allowed");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ipVersion = isIP(host);
  if (ipVersion === 4 || ipVersion === 6) {
    if (isBlockedIp(host)) {
      throw new SsrfBlockedError("Access to private or loopback IP is blocked");
    }
    return { url, address: host, family: ipVersion };
  }

  const records = await lookupFn(host);
  if (records.length === 0) {
    throw new SsrfBlockedError("Hostname did not resolve");
  }
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new SsrfBlockedError("Hostname resolved to a blocked IP address");
    }
  }

  const first = records[0]!;
  return {
    url,
    address: first.address,
    family: first.family === 6 ? 6 : 4,
  };
}

export interface SafeFetchResult {
  finalUrl: string;
  contentType: string;
  body: string;
}

function requestOnce(
  target: ValidatedTarget,
  timeoutMs: number,
  maxBytes: number,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = target.url.protocol === "https:";
    const transport = isHttps ? https : http;
    const port = target.url.port ? Number(target.url.port) : isHttps ? 443 : 80;

    const req = transport.request(
      {
        host: target.address,
        port,
        path: `${target.url.pathname}${target.url.search}`,
        method: "GET",
        timeout: timeoutMs,
        ...(isHttps ? { servername: target.url.hostname } : {}),
        headers: {
          Host: target.url.host,
          "User-Agent": "MargemFetcher/1.0",
          Accept: "text/html,text/plain,application/xhtml+xml;q=0.9",
        },
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400) {
          res.resume();
          resolve({ statusCode, headers: res.headers, body: "" });
          return;
        }

        const rawType =
          (res.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
        if (rawType && !ALLOWED_CONTENT_TYPES.includes(rawType)) {
          res.destroy();
          reject(new SsrfBlockedError(`Unsupported content type: ${rawType}`));
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        res.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > maxBytes) {
            res.destroy();
            reject(new SsrfBlockedError("Response exceeded maximum allowed size"));
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          resolve({
            statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });

        res.on("error", reject);
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function fetchSafeUrl(
  rawUrl: string,
  options: {
    lookupFn?: DnsLookupFn;
    maxRedirects?: number;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<SafeFetchResult> {
  const lookupFn = options.lookupFn ?? defaultLookup;
  const maxRedirects = options.maxRedirects ?? LINK_FETCH_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? LINK_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? LINK_FETCH_MAX_BYTES;

  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const target = await resolveAndValidateUrl(currentUrl, lookupFn);
    const res = await requestOnce(target, timeoutMs, maxBytes);

    if (res.statusCode >= 300 && res.statusCode < 400) {
      const location = res.headers.location;
      if (!location) {
        throw new Error("Redirect missing Location header");
      }
      if (hop === maxRedirects) {
        throw new SsrfBlockedError("Too many redirects");
      }
      currentUrl = new URL(location, target.url).toString();
      continue;
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`HTTP ${res.statusCode}`);
    }

    const contentType =
      (res.headers["content-type"] ?? "text/plain").split(";")[0]?.trim().toLowerCase() ||
      "text/plain";

    return {
      finalUrl: target.url.toString(),
      contentType,
      body: res.body,
    };
  }

  throw new SsrfBlockedError("Too many redirects");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function extractTextFromHtml(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim()) : null;

  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const text = decodeEntities(cleaned)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { title: title || null, text };
}
