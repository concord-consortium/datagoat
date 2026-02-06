import { getTodayDateString, formatDate, addDays } from "../services/streaks";

interface DateNavigationProps {
  date: string;
  onDateChange: (date: string) => void;
}

export function DateNavigation({ date, onDateChange }: DateNavigationProps) {
  const today = getTodayDateString();
  const isToday = date === today;

  return (
    <div className="flex items-center justify-between">
      <button
        className="btn btn-ghost btn-lg text-2xl"
        onClick={() => onDateChange(addDays(date, -1))}
        aria-label="Previous day"
      >
        &larr;
      </button>

      <div className="flex items-center gap-2">
        <span className={`text-xl font-semibold ${isToday ? "text-primary" : ""}`}>
          {formatDate(date)}
        </span>
        {isToday && (
          <span className="badge badge-primary">Today</span>
        )}
      </div>

      <button
        className="btn btn-ghost btn-lg text-2xl"
        onClick={() => onDateChange(addDays(date, 1))}
        disabled={isToday}
        aria-label="Next day"
      >
        &rarr;
      </button>

      {!isToday && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onDateChange(today)}
        >
          Today
        </button>
      )}
    </div>
  );
}
