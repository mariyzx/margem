import { describe, expect, it } from "vitest";
import { clientFingerprint } from "../security/client-fingerprint";
import { findIpsByHash } from "./find-ip-by-hash";

const hashOf = (ip: string) => clientFingerprint({ ip, headers: {} }).ipHash;

describe("findIpsByHash", () => {
  it("finds the exact IPv4 inside the /24 that the Caddy log shows", () => {
    const result = findIpsByHash(hashOf("203.0.113.77"), ["198.51.100.0", "203.0.113.0"]);

    expect(result.matches).toEqual(["203.0.113.77"]);
    expect(result.tested).toBe(512);
    expect(result.invalid).toEqual([]);
  });

  it("matches what the API logged whatever form req.ip had (IPv4-mapped IPv6)", () => {
    // Node may report a client as ::ffff:a.b.c.d; the API hashes it as plain IPv4.
    const logged = hashOf("::ffff:203.0.113.77");

    expect(findIpsByHash(logged, ["203.0.113.0/24"]).matches).toEqual(["203.0.113.77"]);
    expect(findIpsByHash(logged, ["::ffff:203.0.113.0"]).matches).toEqual(["203.0.113.77"]);
  });

  it("finds the IPv6 /64 from any address inside it", () => {
    const logged = hashOf("2001:db8:abcd:12:aaaa:bbbb:cccc:dddd");

    expect(findIpsByHash(logged, ["2001:db8:abcd:12::", "2001:db8:abcd:13::"]).matches).toEqual([
      "2001:0db8:abcd:0012::/64",
    ]);
    expect(findIpsByHash(logged, ["2001:db8:abcd:12::/64"]).matches).toHaveLength(1);
  });

  it("reports invalid lines instead of skipping them silently", () => {
    const result = findIpsByHash(hashOf("203.0.113.77"), [
      "",
      "not-an-ip",
      "203.0.113.0/16",
      "203.0.113.0",
    ]);

    expect(result.invalid).toEqual(["not-an-ip", "203.0.113.0/16"]);
    expect(result.matches).toEqual(["203.0.113.77"]);
  });

  it("returns no match when the IP is not in the given ranges", () => {
    const result = findIpsByHash(hashOf("203.0.113.77"), ["198.51.100.0"]);
    expect(result.matches).toEqual([]);
    expect(result.tested).toBe(256);
  });

  it("rejects something that is not an ipHash", () => {
    expect(() => findIpsByHash("203.0.113.77", ["203.0.113.0"])).toThrow(/not an ipHash/);
  });
});
