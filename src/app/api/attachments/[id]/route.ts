import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

import { getCurrentUser } from "@/lib/auth/session";
import { getAttachment } from "@/lib/data/documents";
import { storage } from "@/lib/storage/transport";

/**
 * Handing a file back.
 *
 * The volume is never served statically, and this is why: a static mount has
 * no idea who is asking. Every byte leaves through here, after a session is
 * resolved and after the row has been found *through `withOrg()`* -- so an id
 * belonging to another organization does not resolve at all, and this handler
 * never has to compare tenants itself.
 *
 * Reading is `document.view`, which is everyone in the organization, so there
 * is no permission check beyond being signed in. That is the rule the brief
 * was built to: the whole studio can read it. Changing one is `brief.edit`
 * and lives in the actions.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentUser();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachment = await getAttachment(session.actor, id);
  if (!attachment) return new Response("Not found", { status: 404 });

  let stream;
  try {
    stream = await storage().read(attachment.storageKey);
  } catch {
    // A row whose bytes are missing: the volume was restored without the
    // database, or a file was removed by hand. 404 rather than 500 -- the
    // request is not malformed and the server is not broken, the thing
    // genuinely is not there.
    return new Response("Not found", { status: 404 });
  }

  return new Response(Readable.toWeb(stream) as WebReadableStream<Uint8Array> as ReadableStream, {
    headers: {
      // From the allowlist at upload, never from the browser then or now.
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.sizeBytes),
      /*
        `attachment`, always, even for the image types.

        Inline would let a PDF render in the tab, which is nicer to use and is
        also how a file served from this origin gets to run script in it. The
        allowlist already excludes SVG for the same reason; this is the second
        half of that decision. The filename is quoted and stripped of the two
        characters that would let it break out of the header.
      */
      "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/["\\\r\n]/g, "")}"`,
      // It is behind a session and may be replaced; no shared cache should
      // hold it, and no browser should hand it to the next person.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
