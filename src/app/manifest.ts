import type { MetadataRoute } from "next";

import { withBasePath } from "@/lib/base-path";

/**
 * Next's manifest file convention -- served at `/manifest.webmanifest`,
 * linked automatically, no `<link>` tag to hand-write.
 *
 * `start_url` and the icon `src` go through `withBasePath()`: this file's
 * own route is prefixed by Next automatically under `NEXT_PUBLIC_BASE_PATH`,
 * but its *content* -- plain strings the browser reads verbatim -- is not,
 * the same reason the finance letterhead's logo URL needs it
 * (`src/lib/data/organization.ts`).
 *
 * `icons` only lists `icon.svg` for now: `apple-icon.png` needs a
 * rasterized export this environment has no tool to produce (see
 * `KNOWN-GAPS.md`). Once that file exists at `src/app/apple-icon.png`,
 * Next serves and links it automatically -- no change needed here.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mediast Creative",
    short_name: "Mediast",
    description: "ERP, CRM and team collaboration for Mediast Creative.",
    start_url: withBasePath("/"),
    display: "standalone",
    background_color: "#fcfbfa",
    theme_color: "#fcfbfa",
    icons: [
      {
        src: withBasePath("/icon.svg"),
        type: "image/svg+xml",
        sizes: "any",
      },
    ],
  };
}
