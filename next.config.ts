import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted on Docker Compose (see DECISIONS.md), so the build emits a
  // standalone server bundle rather than targeting a serverless platform.
  output: "standalone",
  serverExternalPackages: ["pg"],
};

export default nextConfig;
