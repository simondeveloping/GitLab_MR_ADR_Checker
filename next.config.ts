import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: {
    agentUpgrade: "security",
  },
  // Der Webhook-Endpunkt startet Container ueber child_process und liest den
  // JSON-Store vom Dateisystem. Beides darf nicht in ein Edge-Bundle wandern.
  serverExternalPackages: ["@gitbeaker/rest"],
};

export default nextConfig;
