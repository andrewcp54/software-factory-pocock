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
  // The action trims before it checks and stores, so judge what it would store.
  const body = draft.trim();
  const tooLong = body.length > MAX_NOTE_LENGTH;
  // The action rejects a blank note, so a blank box is never worth sending.
  const blank = body.length === 0;
  const unsaved = body !== (savedBody ?? "");

  return {
    length: body.length,
    maxLength: MAX_NOTE_LENGTH,
    tooLong,
    unsaved,
    canSave: unsaved && !blank && !tooLong,
  };
}
