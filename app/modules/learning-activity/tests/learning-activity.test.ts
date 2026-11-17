import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  LessonProgressStatus,
  UserRole,
  VideoWatchEventType,
} from "~/db/schema";
import { createLearningActivity } from "../index.server";

const NOW = new Date("2026-11-17T12:00:00.000Z");

let db: TestDb;
let student: typeof schema.users.$inferSelect;
let lessonId: number;
let quizId: number;

function get(userId = student.id, days = 7) {
  return createLearningActivity(db).get(userId, { now: NOW, days });
}

function activeDates(userId = student.id, days = 7) {
  return get(userId, days)
    .days.filter((day) => day.active)
    .map((day) => day.date);
}

// ─── Fixtures ───
// The module only reads rows that other features write, so the rows go in
// directly. Kept in one place so a schema change touches only this block.

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  student = base.user;
  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module", position: 1 })
    .returning()
    .get();
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson", position: 1 })
    .returning()
    .get().id;
  quizId = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Quiz", passingScore: 0.7 })
    .returning()
    .get().id;
});

function addUser(name: string) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name}@example.com`, role: UserRole.Student })
    .returning()
    .get();
}

function completeLesson(
  at: string,
  userId = student.id,
  status = LessonProgressStatus.Completed
) {
  db.insert(schema.lessonProgress)
    .values({ userId, lessonId, status, completedAt: at })
    .run();
}

function attemptQuiz(at: string, userId = student.id) {
  db.insert(schema.quizAttempts)
    .values({ userId, quizId, score: 1, passed: true, attemptedAt: at })
    .run();
}

/** `count` events, ten seconds apart, starting at `from`. */
function watch(
  from: string,
  count: number,
  {
    eventType = VideoWatchEventType.Progress,
    userId = student.id,
  }: { eventType?: VideoWatchEventType; userId?: number } = {}
) {
  for (let i = 0; i < count; i++) {
    db.insert(schema.videoWatchEvents)
      .values({
        userId,
        lessonId,
        eventType,
        positionSeconds: i * 10,
        createdAt: new Date(Date.parse(from) + i * 10_000).toISOString(),
      })
      .run();
  }
}

// ─── The window ───

describe("the days", () => {
  it("lists every UTC day of the window, oldest first, ending today", () => {
    const { days } = get(student.id, 3);

    expect(days.map((day) => day.date)).toEqual([
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
    ]);
  });

  it("covers the last 365 days by default", () => {
    const { days } = createLearningActivity(db).get(student.id, { now: NOW });

    expect(days).toHaveLength(365);
    expect(days[0].date).toBe("2025-11-18");
    expect(days.at(-1)?.date).toBe("2026-11-17");
  });

  it("has no Active Day and no streak for a Student who did nothing", () => {
    const activity = get();

    expect(activity.days.every((day) => !day.active)).toBe(true);
    expect(activity.currentStreak).toBe(0);
    expect(activity.longestStreak).toBe(0);
  });

  it("ignores activity before the first day of the window", () => {
    completeLesson("2026-11-14T23:59:59.999Z");
    completeLesson("2026-11-15T00:00:00.000Z");

    expect(activeDates(student.id, 3)).toEqual(["2026-11-15"]);
  });

  it("splits days at UTC midnight", () => {
    attemptQuiz("2026-11-15T23:59:59.000Z");

    expect(activeDates()).toEqual(["2026-11-15"]);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects %s days", (days) => {
    expect(() => get(student.id, days)).toThrow(
      new RangeError(`days must be a positive integer, got ${days}`)
    );
  });

  it("can be a single day: today", () => {
    watch("2026-11-17T09:00:00.000Z", 6);

    expect(get(student.id, 1)).toMatchObject({
      days: [{ date: "2026-11-17", active: true }],
      currentStreak: 1,
      longestStreak: 1,
    });
  });
});

// ─── What makes an Active Day ───

describe("an Active Day", () => {
  it("is a day the Student completed a lesson", () => {
    completeLesson("2026-11-16T09:00:00.000Z");

    const day = get().days.find((d) => d.date === "2026-11-16");
    expect(day).toMatchObject({ active: true, lessonsCompleted: 1 });
  });

  it("is not a day a lesson was only started", () => {
    completeLesson(
      "2026-11-16T09:00:00.000Z",
      student.id,
      LessonProgressStatus.InProgress
    );

    expect(activeDates()).toEqual([]);
  });

  it("is a day the Student attempted a quiz", () => {
    attemptQuiz("2026-11-16T09:00:00.000Z");
    attemptQuiz("2026-11-16T10:00:00.000Z");

    const day = get().days.find((d) => d.date === "2026-11-16");
    expect(day).toMatchObject({ active: true, quizAttempts: 2 });
  });

  it("is a day the Student watched 60 seconds of video", () => {
    watch("2026-11-16T09:00:00.000Z", 6);

    const day = get().days.find((d) => d.date === "2026-11-16");
    expect(day).toMatchObject({ active: true, secondsWatched: 60 });
  });

  it("sums video watched across the whole day", () => {
    watch("2026-11-16T09:00:00.000Z", 3);
    watch("2026-11-16T20:00:00.000Z", 3);

    expect(activeDates()).toEqual(["2026-11-16"]);
  });

  it("is not a day with only 50 seconds of video", () => {
    watch("2026-11-16T09:00:00.000Z", 5);

    const day = get().days.find((d) => d.date === "2026-11-16");
    expect(day).toMatchObject({ active: false, secondsWatched: 50 });
  });

  it("does not add video watched either side of UTC midnight", () => {
    watch("2026-11-15T23:59:30.000Z", 6);

    expect(activeDates()).toEqual([]);
  });

  it("counts only progress heartbeats as video watched", () => {
    watch("2026-11-16T09:00:00.000Z", 6, {
      eventType: VideoWatchEventType.Play,
    });
    watch("2026-11-16T10:00:00.000Z", 6, {
      eventType: VideoWatchEventType.Pause,
    });

    expect(get().days.every((day) => day.secondsWatched === 0)).toBe(true);
  });

  it("counts only the Student's own activity", () => {
    const other = addUser("other");
    completeLesson("2026-11-16T09:00:00.000Z", other.id);
    attemptQuiz("2026-11-16T09:00:00.000Z", other.id);
    watch("2026-11-16T09:00:00.000Z", 6, { userId: other.id });

    expect(activeDates()).toEqual([]);
    expect(activeDates(other.id)).toEqual(["2026-11-16"]);
  });
});

// ─── Streaks ───

describe("streaks", () => {
  it("count consecutive Active Days ending today", () => {
    completeLesson("2026-11-15T09:00:00.000Z");
    attemptQuiz("2026-11-16T09:00:00.000Z");
    watch("2026-11-17T09:00:00.000Z", 6);

    expect(get()).toMatchObject({ currentStreak: 3, longestStreak: 3 });
  });

  it("are not broken by a today that has no activity yet", () => {
    completeLesson("2026-11-15T09:00:00.000Z");
    completeLesson("2026-11-16T09:00:00.000Z");

    expect(get().currentStreak).toBe(2);
  });

  it("end when one UTC day is missed", () => {
    completeLesson("2026-11-11T09:00:00.000Z");
    completeLesson("2026-11-12T09:00:00.000Z");
    completeLesson("2026-11-13T09:00:00.000Z");
    completeLesson("2026-11-15T09:00:00.000Z");

    expect(get()).toMatchObject({ currentStreak: 0, longestStreak: 3 });
  });

  it("keep the current streak apart from a longer, older one", () => {
    completeLesson("2026-11-11T09:00:00.000Z");
    completeLesson("2026-11-12T09:00:00.000Z");
    completeLesson("2026-11-13T09:00:00.000Z");
    completeLesson("2026-11-16T09:00:00.000Z");
    completeLesson("2026-11-17T09:00:00.000Z");

    expect(get()).toMatchObject({ currentStreak: 2, longestStreak: 3 });
  });

  it("count a streak that runs to the first day of the window", () => {
    completeLesson("2026-11-15T09:00:00.000Z");
    completeLesson("2026-11-16T09:00:00.000Z");
    completeLesson("2026-11-17T09:00:00.000Z");

    expect(get(student.id, 3)).toMatchObject({
      currentStreak: 3,
      longestStreak: 3,
    });
  });
});
