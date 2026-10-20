/**
 * What may be uploaded, and how big.
 *
 * Pure and dependency-free so the rules can be asserted without a disk, a
 * database or a session -- they are the whole of what stands between a file
 * input and this deployment's one volume, and `DECISIONS.md` named "no size
 * limit worth the name" as a reason not to accept uploads at all.
 */

/**
 * Per file. Ten megabytes holds a brief, a signed PDF and a photograph off a
 * phone, and stops one person filling a volume nobody can grow.
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Per brief. The ceiling that actually bounds disk growth: without it, "10 MB
 * each" is no limit at all once somebody uploads two hundred of them.
 */
export const MAX_FILES_PER_DOCUMENT = 20;

/**
 * What a brief is allowed to carry: the document somebody signed, and the
 * pictures the work is judged against.
 *
 * An allowlist rather than a blocklist, and the extension is decided from this
 * map rather than read off the uploaded name -- a blocklist is a guess about
 * what is dangerous, and `.svg` is the reminder that an image format can carry
 * script. SVG is absent for exactly that reason.
 */
export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type UploadRefusal = "fileTooLarge" | "fileTypeNotAllowed" | "tooManyFiles" | "fileEmpty";

/**
 * Whether this file may be stored, as a reason rather than a boolean.
 *
 * `existingCount` is how many the document already holds, so the ceiling is
 * enforced where the decision is made rather than trusted to the caller.
 */
export function refuseUpload({
  sizeBytes,
  mimeType,
  existingCount,
}: {
  sizeBytes: number;
  mimeType: string;
  existingCount: number;
}): UploadRefusal | null {
  if (existingCount >= MAX_FILES_PER_DOCUMENT) return "tooManyFiles";
  // Before the size check: a zero-byte file is a failed read or an empty
  // picker, and "too large" would be a confusing thing to say about it.
  if (sizeBytes <= 0) return "fileEmpty";
  if (sizeBytes > MAX_FILE_BYTES) return "fileTooLarge";
  if (!(mimeType in ALLOWED_TYPES)) return "fileTypeNotAllowed";
  return null;
}

/**
 * Where a file sits on the volume: `{organizationId}/{attachmentId}.{ext}`.
 *
 * Both halves are ids this app generated, never text a browser sent. A
 * filename from a browser is attacker-controlled -- `../../etc/passwd` is the
 * classic and two people uploading `brief.pdf` is the boring one -- and
 * deriving the path from ids ends both without needing to sanitise anything.
 * The name somebody typed survives in `attachments.file_name`, which is used
 * for the download and shown on screen, and never touches a filesystem.
 *
 * The organization segment is not security -- every read goes through
 * `withOrg()` -- it is so one tenant's files can be found, counted or removed
 * as a unit.
 */
export function storageKeyFor(organizationId: string, attachmentId: string, mimeType: string): string {
  const extension = ALLOWED_TYPES[mimeType];
  if (!extension) throw new Error(`Refusing to store an unsupported type: ${mimeType}`);
  return `${organizationId}/${attachmentId}.${extension}`;
}
