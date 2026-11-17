import { describe, it, expect } from "vitest";
import { noteDraftStatus } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("noteDraftStatus", () => {
  it("counts the characters against the note limit", () => {
    const status = noteDraftStatus("hello", null);
    expect(status.length).toBe(5);
    expect(status.maxLength).toBe(MAX_NOTE_LENGTH);
  });

  it("can save a new note", () => {
    expect(noteDraftStatus("first thought", null)).toMatchObject({
      unsaved: true,
      tooLong: false,
      canSave: true,
    });
  });

  it("has nothing to save when the box matches the saved note", () => {
    expect(noteDraftStatus("same", "same")).toMatchObject({
      unsaved: false,
      canSave: false,
    });
  });

  it("has nothing to save when the box is empty and no note exists", () => {
    expect(noteDraftStatus("", null)).toMatchObject({
      unsaved: false,
      canSave: false,
    });
  });

  it("can save an edit to an existing note", () => {
    expect(noteDraftStatus("same, edited", "same")).toMatchObject({
      unsaved: true,
      canSave: true,
    });
  });

  it("will not save a blank box, even over an existing note", () => {
    expect(noteDraftStatus("   \n", "old note")).toMatchObject({
      unsaved: true,
      canSave: false,
    });
  });

  it("allows a note of exactly the limit", () => {
    const status = noteDraftStatus("a".repeat(MAX_NOTE_LENGTH), null);
    expect(status.tooLong).toBe(false);
    expect(status.canSave).toBe(true);
  });

  it("flags a note one character over the limit and will not save it", () => {
    const status = noteDraftStatus("a".repeat(MAX_NOTE_LENGTH + 1), null);
    expect(status.tooLong).toBe(true);
    expect(status.canSave).toBe(false);
  });
});
