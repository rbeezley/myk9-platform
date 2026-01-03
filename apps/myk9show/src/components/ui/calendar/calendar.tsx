import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button/buttonVariants"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

import type { CaptionProps } from 'react-day-picker';

interface YearMonthCaptionProps extends CaptionProps {
  onMonthChange?: (month: Date) => void;
}

function YearMonthCaption(props: YearMonthCaptionProps) {
  const { displayMonth } = props;
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
  // We'll dispatch a native event to the parent DayPicker for month change
  function handleYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newDate = new Date(displayMonth);
    newDate.setFullYear(Number(e.target.value));
    // Find the parent element with data-rdp and dispatch a synthetic event
    // Removed unused 'calendar' variable (e.target.closest('[data-rdp]') as any)?.__reactFiber$;
    if (props && typeof (props as YearMonthCaptionProps).onMonthChange === 'function') {
      (props as YearMonthCaptionProps).onMonthChange!(newDate);
    }
  }
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i).toLocaleString('default', { month: 'long' }));

  function handleMonthChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newDate = new Date(displayMonth);
    newDate.setMonth(Number(e.target.value));
    if (props && typeof props.onMonthChange === 'function') {
      props.onMonthChange!(newDate);
    }
  }

  function handlePrevMonth() {
    const prev = new Date(displayMonth);
    prev.setMonth(prev.getMonth() - 1);
    props.onMonthChange?.(prev);
  }
  function handleNextMonth() {
    const next = new Date(displayMonth);
    next.setMonth(next.getMonth() + 1);
    props.onMonthChange?.(next);
  }

  return (
    <div className="flex gap-2 justify-center items-center">
      <button
        type="button"
        className="border border-input rounded p-1 bg-background text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Previous Month"
        onClick={handlePrevMonth}
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      <div className="relative">
        <select
          className="border border-input rounded px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-6 appearance-none"
          value={displayMonth.getMonth()}
          onChange={handleMonthChange}
          style={{ minWidth: 90 }}
        >
          {months.map((month, idx) => (
            <option key={month} value={idx}>{month}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </div>
      <div className="relative">
        <select
          className="border border-input rounded px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-6 appearance-none"
          value={displayMonth.getFullYear()}
          onChange={handleYearChange}
          style={{ minWidth: 70 }}
        >
          {years.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </div>
      <button
        type="button"
        className="border border-input rounded p-1 bg-background text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Next Month"
        onClick={handleNextMonth}
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18" /></svg>
      </button>
    </div>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const [month, setMonth] = React.useState(() => props.month ?? new Date());
  const handleMonthChange = (newMonth: Date) => {
    setMonth(newMonth);
    if (props.onMonthChange && typeof props.onMonthChange === 'function') {
      props.onMonthChange(newMonth);
    }
  };
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      month={month}
      onMonthChange={handleMonthChange}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
        Caption: (captionProps) => (
          <YearMonthCaption
            {...captionProps}
            onMonthChange={handleMonthChange}
          />
        ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
