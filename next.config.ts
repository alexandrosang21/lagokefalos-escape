import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // allow the dev server to accept requests from this LAN IP (e.g. testing the
  // game on a phone at http://192.168.1.7:3000)
  allowedDevOrigins: ["192.168.1.7"],
};

export default nextConfig;
