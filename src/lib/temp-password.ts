import { randomInt } from "node:crypto";

/**
 * A one-off password an admin reads out to somebody who has lost theirs.
 *
 * Built to be *dictated* -- over the phone, across a desk, in a WhatsApp
 * message -- which is the only reason this exists rather than reusing the
 * random token behind a reset link. Two properties follow from that, and they
 * pull against each other:
 *
 * - **No character you have to spell out.** The alphabet drops `0`/`O`,
 *   `1`/`l`/`I`, `5`/`S`, `2`/`Z` and `8`/`B`, the pairs that get misheard or
 *   mistyped, and stays lower case so nobody has to say "capital". Grouping
 *   into threes gives the ear somewhere to rest.
 * - **Enough entropy to survive being permanent.** This deployment does not
 *   force a change at the next sign-in, so a temporary password is only
 *   temporary if its holder chooses to replace it. Treating it as long-lived
 *   is the safe assumption: 12 characters from a 24-letter alphabet is about
 *   55 bits, which is far past anything guessable and well clear of the
 *   ten-character minimum `passwordSchema` enforces.
 *
 * `randomInt` rather than `Math.random`: it is cryptographically sourced and
 * rejection-samples internally, so no letter is likelier than another. A
 * modulo of `randomBytes` would quietly bias the front of the alphabet.
 */

/** Lower case, with every easily-confused letter and digit removed. */
const ALPHABET = "acdefghjkmnpqrtuvwxy34679";

const GROUPS = 4;
const PER_GROUP = 3;

export function generateTempPassword(): string {
  const groups: string[] = [];

  for (let group = 0; group < GROUPS; group += 1) {
    let chunk = "";
    for (let index = 0; index < PER_GROUP; index += 1) {
      chunk += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(chunk);
  }

  // Hyphens are cosmetic -- they are part of the password, so they are typed
  // too, but they exist so somebody can read it aloud without losing their
  // place.
  return groups.join("-");
}
