import { Flame, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import type {
  LearningActivity,
  LearningActivityDay,
} from "~/modules/learning-activity/index.server";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function describe(day: LearningActivityDay) {
  const date = new Date(`${day.date}T00:00:00.000Z`).toLocaleDateString(
    "en-US",
    { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }
  );
  const parts = [
    day.lessonsCompleted > 0 &&
      plural(day.lessonsCompleted, "lesson") + " completed",
    day.quizAttempts > 0 && plural(day.quizAttempts, "quiz attempt"),
    day.secondsWatched > 0 &&
      plural(Math.round(day.secondsWatched / 60), "min") + " watched",
  ].filter(Boolean);
  return `${date}: ${parts.length > 0 ? parts.join(", ") : "no activity"}`;
}

function Streak({
  icon: Icon,
  label,
  days,
}: {
  icon: typeof Flame;
  label: string;
  days: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{plural(days, "day")}</span>
    </div>
  );
}

function ActiveDayGrid({ days }: { days: LearningActivityDay[] }) {
  // Columns are weeks starting on Sunday (UTC), so the first column is padded
  // up to the weekday of the oldest day.
  const leadingBlanks =
    days.length > 0 ? new Date(`${days[0].date}T00:00:00.000Z`).getUTCDay() : 0;

  return (
    <div className="overflow-x-auto pb-1">
      <ol
        aria-label="Active Days"
        className="grid w-max grid-flow-col grid-rows-7 gap-[3px]"
      >
        {Array.from({ length: leadingBlanks }, (_, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- placeholders never reorder
          <li key={`blank-${i}`} aria-hidden className="size-3" />
        ))}
        {days.map((day) => (
          <li
            key={day.date}
            data-date={day.date}
            data-active={day.active}
            title={describe(day)}
            aria-label={describe(day)}
            className={cn(
              "size-3 rounded-sm",
              day.active ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </ol>
    </div>
  );
}

export function LearningActivityCalendar({
  activity,
}: {
  activity: LearningActivity;
}) {
  const { days, currentStreak, longestStreak } = activity;
  const activeDays = days.filter((day) => day.active).length;

  return (
    <Card aria-labelledby="learning-activity-heading">
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <h2 id="learning-activity-heading" className="text-xl font-semibold">
          Learning Activity
        </h2>
        <p className="text-sm text-muted-foreground">
          {plural(activeDays, "active day")} in the last{" "}
          {plural(days.length, "day")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActiveDayGrid days={days} />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Streak icon={Flame} label="Current streak" days={currentStreak} />
          <Streak icon={Trophy} label="Longest streak" days={longestStreak} />
        </div>
      </CardContent>
    </Card>
  );
}
