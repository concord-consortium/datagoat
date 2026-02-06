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
        className="btn btn-ghost btn-sm"
        onClick={() => onDateChange(addDays(date, -1))}
        aria-label="Previous day"
      >
        &larr;
      </button>

      <div className="text-center">
        <span className={`font-semibold ${isToday ? "text-primary" : ""}`}>
          {formatDate(date)}
        </span>
        {isToday && (
          <span className="badge badge-primary badge-sm ml-2">Today</span>
        )}
      </div>

      <button
        className="btn btn-ghost btn-sm"
        onClick={() => onDateChange(addDays(date, 1))}
        disabled={isToday}
        aria-label="Next day"
      >
        &rarr;
      </button>

      {!isToday && (
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => onDateChange(today)}
        >
          Today
        </button>
      )}
    </div>
  );
}
