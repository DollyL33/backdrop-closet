// A simple per-visitor limit so nobody can use up the free NVIDIA quota.
// It lives in memory, so it resets whenever the server restarts.
const hits = new Map();
const LOCAL = new Set(["local", "::1", "127.0.0.1", "::ffff:127.0.0.1"]);

export function tooManyRequests(request, { limit, windowMs = 60 * 60 * 1000 }) {
  const ip = (request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (LOCAL.has(ip)) return false; // no limit when running on your own computer
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}
