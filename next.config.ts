import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone output is for the Docker image and nothing else, so the
   * Dockerfile asks for it by name.
   *
   * It used to be unconditional, which meant `next start` refused to run
   * locally -- Next will not serve a standalone build that way -- and the
   * end-to-end suite could not start a production server to test against.
   * Opt-in keeps both: the image gets its bundle, and a local production build
   * is something you can actually run.
   */
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
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
