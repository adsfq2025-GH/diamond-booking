import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating dev-tools badge so QA screenshots match production.
  devIndicators: false,
};

export default nextConfig;
