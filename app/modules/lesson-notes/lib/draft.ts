import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraft = {
  length: number;
  maxLength: number;
  tooLong: boolean;
  /** The box differs from the note as last saved. */
  unsaved: boolean;
  canSave: boolean;
};

export function describeDraft(
  draft: string,
  savedBody: string | null
): NoteDraft {
  const tooLong = draft.length > MAX_NOTE_LENGTH;
  // The action rejects a blank note, so a blank box is never worth sending.
  const blank = draft.trim().length === 0;
  const unsaved = draft !== (savedBody ?? "");

  return {
    length: draft.length,
    maxLength: MAX_NOTE_LENGTH,
    tooLong,
    unsaved,
    canSave: unsaved && !blank && !tooLong,
  };
}
