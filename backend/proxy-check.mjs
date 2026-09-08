import assert from "node:assert/strict";

import { parseTrustedProxyIps, resolveClientIp } from "./proxy.mjs";

assert.deepEqual(parseTrustedProxyIps("127.0.0.1, ::1, 127.0.0.1"), ["127.0.0.1", "::1"]);

// Default is fail-closed: an arbitrary caller cannot spoof its rate-limit identity with XFF.
assert.equal(
  resolveClientIp({
    socketAddress: "203.0.113.10",
    forwardedFor: "198.51.100.77",
    trustedProxyIps: [],
  }),
  "203.0.113.10",
);

// A specifically trusted edge proxy may supply the client boundary.
assert.equal(
  resolveClientIp({
    socketAddress: "10.0.0.5",
    forwardedFor: "198.51.100.77",
    trustedProxyIps: ["10.0.0.5"],
  }),
  "198.51.100.77",
);

// Caller-prepended leftmost spoofing cannot override a nearer untrusted hop.
assert.equal(
  resolveClientIp({
    socketAddress: "10.0.0.5",
    forwardedFor: "1.2.3.4, 198.51.100.77",
    trustedProxyIps: ["10.0.0.5"],
  }),
  "198.51.100.77",
);

// Multiple explicitly trusted proxies are skipped from the trusted edge inward.
assert.equal(
  resolveClientIp({
    socketAddress: "10.0.0.5",
    forwardedFor: "198.51.100.77, 10.0.0.4",
    trustedProxyIps: ["10.0.0.5", "10.0.0.4"],
  }),
  "198.51.100.77",
);

// IPv4-mapped socket addresses normalize correctly.
assert.equal(
  resolveClientIp({
    socketAddress: "::ffff:10.0.0.5",
    forwardedFor: "198.51.100.77",
    trustedProxyIps: ["10.0.0.5"],
  }),
  "198.51.100.77",
);

console.log("backend:proxy-check passed");
