import { describeDraft, type NoteDraft } from "./lib/draft";

export type { NoteDraft };

/**
 * What the note editor shows for the text in the box, given the note as it
 * was last saved (`null` when the Student has never saved one).
 */
export function noteDraftStatus(
  draft: string,
  savedBody: string | null
): NoteDraft {
  return describeDraft(draft, savedBody);
}
