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
  /**
   * Empty by default -- the app owns the whole origin, which is what local
   * dev, the e2e suite and a LAN deployment all expect. A deployment that
   * shares its domain with something else sets `NEXT_PUBLIC_BASE_PATH=/os`
   * at build time instead, and every internal link, redirect and asset the
   * framework generates picks it up on its own from here.
   *
   * `NEXT_PUBLIC_`, not a private name, because a handful of places outside
   * the framework's own reach have to build a path by hand -- an
   * `EventSource` URL, a plain `<a>` for a file download -- and need the
   * same value in the browser. See `lib/base-path.ts`.
   *
   * Build time only, and inlined into the bundles -- there is no way to
   * change it by setting an environment variable on an already-built image,
   * only by rebuilding with a different one.
   */
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
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
