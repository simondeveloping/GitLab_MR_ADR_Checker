import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Der Webhook-Endpunkt startet Container ueber child_process und liest den
  // JSON-Store vom Dateisystem. Beides darf nicht in ein Edge-Bundle wandern.
  serverExternalPackages: ["@gitbeaker/rest"],
};

export default nextConfig;
