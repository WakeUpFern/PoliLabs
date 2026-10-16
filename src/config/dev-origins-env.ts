// Hostnames that `next dev` must accept for its dev resources (/_next/*, HMR)
// when the app is opened from another device on the local network, e.g. a
// phone at http://192.168.1.20:3000. They are derived from the same origins
// Better Auth trusts (BETTER_AUTH_TRUSTED_ORIGINS), so one variable enables
// both the page scripts and the sign-in request.
export function readDevOriginHosts(
  env: Record<string, string | undefined>,
): string[] {
  const hosts = new Set<string>();
  for (const entry of (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")) {
    const value = entry.trim();
    if (!value) continue;
    try {
      hosts.add(new URL(value).hostname.toLowerCase());
    } catch {
      // Better Auth also accepts wildcard patterns; they are not URLs and are
      // not valid allowedDevOrigins entries, so they are skipped here.
    }
  }
  return [...hosts];
}
