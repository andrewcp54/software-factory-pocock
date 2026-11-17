import { db } from "~/db";
import { getLearningActivity, type Db } from "./lib/learning-activity";

export type {
  LearningActivity,
  LearningActivityDay,
} from "./lib/learning-activity";

/**
 * Learning Activity bound to a database. The app uses `learningActivity`,
 * which reads the app database; tests build their own against a test database.
 */
export function createLearningActivity(database: Db) {
  return {
    /**
     * A Student's Active Days over the last `days` UTC days (365 by default),
     * ending today, with their current and longest streak in that window.
     *
     * `now` is the only clock read. Throws a RangeError if `days` is not a
     * positive integer.
     */
    get(userId: number, options: { now: Date; days?: number }) {
      return getLearningActivity(database, userId, options);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const learningActivity = /* @__PURE__ */ createLearningActivity(db);
