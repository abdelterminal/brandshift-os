/**
 * What a brief should answer, for somebody who has never written one.
 *
 * Section titles plus the question each one exists to answer. "Start from the
 * template" drops these into the editor as a first draft; the author replaces
 * the guidance with the answers, so nothing here survives into a finished
 * brief. That is why the guidance can be blunt -- it is scaffolding, not copy.
 *
 * Not a database table, for the reason `DECISIONS.md` already gives about the
 * delivery playbook: this is one agency with one way of briefing work, and a
 * screen for editing the shape of a brief would be configuration for a choice
 * nobody is making. A second shape, if it is ever wanted, is a table then.
 *
 * The titles live in the message catalogues rather than here, because a brief
 * written by a French-speaking account manager should arrive in French. This
 * file owns the order and the keys; `messages/*.json` owns the words.
 */

/**
 * The eight sections, in the order they are asked.
 *
 * Deliberately an order of thinking rather than of importance: what the client
 * does, then what they want, then who they are talking to, then what we will
 * make -- because somebody who writes the deliverables first tends to write
 * the list they already had in mind rather than the one the objective implies.
 */
export const BRIEF_SECTION_KEYS = [
  "background",
  "objective",
  "audience",
  "message",
  "deliverables",
  "constraints",
  "success",
  "practical",
] as const;

export type BriefSectionKey = (typeof BRIEF_SECTION_KEYS)[number];

export type BriefTemplateSection = { title: string; detail: string };

/**
 * Builds the starting sections from a translator.
 *
 * Takes the lookup rather than calling one, so this stays free of
 * `next-intl` and can be used from a server component, a client component or
 * a test without three different import paths.
 */
export function briefTemplate(
  t: (key: string) => string,
): BriefTemplateSection[] {
  return BRIEF_SECTION_KEYS.map((key) => ({
    title: t(`section_${key}_title`),
    detail: t(`section_${key}_detail`),
  }));
}
