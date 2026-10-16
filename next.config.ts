import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { readDevOriginHosts } from "./src/config/dev-origins-env";

// next.config is evaluated before Next loads .env files, so load them here to
// read BETTER_AUTH_TRUSTED_ORIGINS from .env.local.
loadEnvConfig(process.cwd());

const nextConfig: NextConfig = {
  // Only used by `next dev`: lets another device on the local network (for
  // example a phone) load the dev scripts so the page can hydrate.
  allowedDevOrigins: readDevOriginHosts(process.env),
};

export default nextConfig;
