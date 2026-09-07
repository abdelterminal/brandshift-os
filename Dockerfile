# Next.js standalone output, built once and run as a non-root user.
# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
# A sub-path this build is mounted under, e.g. /os -- empty for the ordinary
# LAN deployment, where the app owns the whole origin. `next.config.ts` reads
# this into `basePath`, which is compiled into the bundle: there is no way to
# change it later by setting an environment variable on the finished image,
# only by rebuilding with a different one. See src/lib/base-path.ts for why
# it is a build ARG here and a normal environment variable at runtime too.
ARG NEXT_PUBLIC_BASE_PATH=""
# Asks next.config.ts for the standalone bundle this image is built around.
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
# Redeclared: an ARG's value does not cross a FROM on its own, and a couple of
# server-side reads of this (see src/lib/base-path.ts) should see the same
# value at runtime as the build baked into the client bundles, rather than
# relying entirely on Next's own inlining of NEXT_PUBLIC_* reads.
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

# Chromium, for rendering a quote or an invoice to a PDF.
#
# Alpine's own package rather than the one Playwright downloads: Playwright
# ships glibc builds, and this image is musl, so `npx playwright install` here
# produces a binary that cannot start. `playwright-core` is only the driver --
# it never downloads a browser -- and PDF_CHROMIUM_PATH points it at this one.
#
# The font packages are not optional. The sheet asks for Space Grotesk and
# Inter, which the app self-hosts and Chromium will fetch, but anything they do
# not cover -- a client name in Arabic, a currency symbol -- renders as empty
# boxes on an image with no fonts at all, and nobody notices until it is in a
# PDF that has already been sent.
RUN apk add --no-cache chromium font-noto font-noto-arabic ttf-dejavu
ENV PDF_CHROMIUM_PATH=/usr/bin/chromium-browser

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Next's standalone tracer follows JavaScript imports but playwright-core also
# reads package metadata (including browsers.json) at runtime. Copy the package
# intact so the externalized driver can initialize inside the production image.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/playwright-core ./node_modules/playwright-core
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
