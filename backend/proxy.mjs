import net from "node:net";

function normalizeIp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withoutBrackets = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  const mapped = withoutBrackets.toLowerCase().startsWith("::ffff:") ? withoutBrackets.slice(7) : withoutBrackets;
  return net.isIP(mapped) ? mapped : "";
}

export function parseTrustedProxyIps(value) {
  const values = String(value || "")
    .split(",")
    .map((item) => normalizeIp(item))
    .filter(Boolean);
  return [...new Set(values)];
}

export function resolveClientIp({ socketAddress, forwardedFor, trustedProxyIps = [] }) {
  const socketIp = normalizeIp(socketAddress) || "unknown";
  const trusted = new Set(trustedProxyIps.map((item) => normalizeIp(item)).filter(Boolean));

  // Forwarded headers are untrusted unless the TCP peer itself is an explicitly trusted proxy.
  if (!trusted.has(socketIp)) return socketIp;

  const chain = String(forwardedFor || "")
    .split(",")
    .map((item) => normalizeIp(item))
    .filter(Boolean);

  // Walk from the trusted edge toward the original client. The first address not in the
  // explicit proxy allow-list is the client boundary. Caller-prepended leftmost values do
  // not override a nearer untrusted hop appended by the trusted proxy.
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const candidate = chain[index];
    if (!trusted.has(candidate)) return candidate;
  }

  return socketIp;
}
