import { and, count, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import {
  LessonProgressStatus,
  VideoWatchEventType,
  lessonProgress,
  quizAttempts,
  videoWatchEvents,
} from "~/db/schema";

// ─── Learning Activity ───
// Which UTC days a Student was an Active Day, and the streaks they make.
// Read-only: it derives everything from rows other features already write,
// so there is no table of its own to keep in step.

export type Db = BetterSQLite3Database<typeof schema>;

export type LearningActivityDay = {
  /** The UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  active: boolean;
  lessonsCompleted: number;
  quizAttempts: number;
  secondsWatched: number;
};

export type LearningActivity = {
  /** Oldest first, ending with today (UTC). No day is skipped. */
  days: LearningActivityDay[];
  currentStreak: number;
  longestStreak: number;
};

export const DEFAULT_ACTIVITY_DAYS = 365;

/** Watching at least this much video in a day makes it an Active Day. */
export const MIN_SECONDS_WATCHED = 60;

// Matches the player's heartbeat interval (`app/components/youtube-player.tsx`):
// each `progress` event stands for this many seconds of playback.
const HEARTBEAT_SECONDS = 10;

const DAY_MS = 86_400_000;

type DayCount = { day: string; count: number };

type Window = { from: string; until: string };

/** A table whose rows, each stamped with a time, are one Student's activity. */
type Source = {
  table: typeof lessonProgress | typeof quizAttempts | typeof videoWatchEvents;
  at: SQLiteColumn;
  user: SQLiteColumn;
  only?: SQL;
};

const LESSONS_COMPLETED: Source = {
  table: lessonProgress,
  at: lessonProgress.completedAt,
  user: lessonProgress.userId,
  only: eq(lessonProgress.status, LessonProgressStatus.Completed),
};

const QUIZ_ATTEMPTS: Source = {
  table: quizAttempts,
  at: quizAttempts.attemptedAt,
  user: quizAttempts.userId,
};

const HEARTBEATS: Source = {
  table: videoWatchEvents,
  at: videoWatchEvents.createdAt,
  user: videoWatchEvents.userId,
  only: eq(videoWatchEvents.eventType, VideoWatchEventType.Progress),
};

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOf(day: string): string {
  return `${day}T00:00:00.000Z`;
}

function addDays(day: string, days: number): string {
  return utcDay(new Date(Date.parse(startOf(day)) + days * DAY_MS));
}

/** Every day from `first` to `last` inclusive, with none skipped. */
function dayRange(first: string, last: string): string[] {
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/** One Student's rows per UTC day, inside the window. At most one row a day. */
function countByDay(
  db: Db,
  source: Source,
  scope: { userId: number; window: Window }
): Map<string, number> {
  const day = sql<string>`substr(${source.at}, 1, 10)`;
  const rows: DayCount[] = db
    .select({ day, count: count() })
    .from(source.table)
    .where(
      and(
        eq(source.user, scope.userId),
        gte(source.at, scope.window.from),
        lt(source.at, scope.window.until),
        source.only
      )
    )
    .groupBy(day)
    .all();
  return new Map(rows.map((row) => [row.day, row.count]));
}

function streaks(days: LearningActivityDay[]) {
  let longestStreak = 0;
  let run = 0;
  for (const day of days) {
    run = day.active ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }

  // Today isn't over, so an inactive today hasn't broken the streak yet:
  // count back from yesterday instead. The window always holds today.
  let end = days.length - 1;
  if (!days[end].active) end -= 1;
  let currentStreak = 0;
  while (end >= 0 && days[end].active) {
    currentStreak += 1;
    end -= 1;
  }

  return { currentStreak, longestStreak };
}

function parseDayCount(days: number | undefined): number {
  const dayCount = days ?? DEFAULT_ACTIVITY_DAYS;
  if (!Number.isInteger(dayCount) || dayCount < 1) {
    throw new RangeError(`days must be a positive integer, got ${dayCount}`);
  }
  return dayCount;
}

export function getLearningActivity(
  db: Db,
  userId: number,
  options: { now: Date; days?: number }
): LearningActivity {
  const today = utcDay(options.now);
  const firstDay = addDays(today, 1 - parseDayCount(options.days));
  const scope = {
    userId,
    window: { from: startOf(firstDay), until: startOf(addDays(today, 1)) },
  };

  const lessons = countByDay(db, LESSONS_COMPLETED, scope);
  const quizzes = countByDay(db, QUIZ_ATTEMPTS, scope);
  const heartbeats = countByDay(db, HEARTBEATS, scope);

  const days = dayRange(firstDay, today).map((date) => {
    const lessonsCompleted = lessons.get(date) ?? 0;
    const quizCount = quizzes.get(date) ?? 0;
    const secondsWatched = (heartbeats.get(date) ?? 0) * HEARTBEAT_SECONDS;
    return {
      date,
      active:
        lessonsCompleted > 0 ||
        quizCount > 0 ||
        secondsWatched >= MIN_SECONDS_WATCHED,
      lessonsCompleted,
      quizAttempts: quizCount,
      secondsWatched,
    };
  });

  return { days, ...streaks(days) };
}
