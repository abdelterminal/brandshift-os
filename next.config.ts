import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted on Docker Compose (see DECISIONS.md), so the build emits a
  // standalone server bundle rather than targeting a serverless platform.
  output: "standalone",
  serverExternalPackages: ["pg"],
  experimental: {
    // Enables `unauthorized()` / `forbidden()` and their `unauthorized.tsx` /
    // `forbidden.tsx` files. The 401-vs-403 distinction is a requirement here
    // -- 403 must not cost you your session -- so it is worth the flag.
    authInterrupts: true,
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
