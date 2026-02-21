"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { ru } from "date-fns/locale"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={ru}
      showOutsideDays={showOutsideDays}
      captionLayout="dropdown"
      startMonth={new Date(1900, 0)}
      endMonth={new Date(2100, 11)}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center h-10 w-full",
        caption_label: "hidden",
        dropdowns: "flex justify-center gap-2 items-center",
        dropdown: "bg-slate-950 border border-slate-700 text-slate-100 rounded-md p-1 text-sm focus:ring-1 focus:ring-amber-500 outline-none cursor-pointer hover:bg-slate-900",
        months_dropdown: "",
        years_dropdown: "",
        nav: "flex items-center gap-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 border-slate-700 text-slate-100 hover:bg-slate-800 absolute left-1 top-1.5"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 border-slate-700 text-slate-100 hover:bg-slate-800 absolute right-1 top-1.5"
        ),
        month_grid: "w-full border-collapse space-y-1 mt-4",
        weekdays: "hidden",
        weekday:
          "text-slate-400 rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].range_end)]:rounded-r-md [&:has([aria-selected].outside)]:bg-slate-800/50 [&:has([aria-selected])]:bg-slate-800 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100 text-slate-100 hover:bg-slate-800 hover:text-white"
        ),
        range_end: "range_end",
        selected:
          "bg-amber-600 text-slate-50 hover:bg-amber-600 hover:text-slate-50 focus:bg-amber-600 focus:text-slate-50",
        today: "bg-slate-800 text-slate-50",
        outside:
          "day-outside text-slate-500 aria-selected:bg-slate-800/50 aria-selected:text-slate-400",
        disabled: "text-slate-500 opacity-50",
        range_middle:
          "aria-selected:bg-slate-800 aria-selected:text-slate-50",
        hidden: "invisible",
        ...classNames,
      }}
      footer={
        <div className="flex justify-between mt-2 border-t border-slate-800 pt-2 px-1">
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // @ts-ignore
              props.onSelect?.(undefined, new Date(), { selected: false });
            }}
            className="text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
          >
            Удалить
          </button>
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const today = new Date();
              // @ts-ignore
              props.onSelect?.(today, today, { selected: true });
            }}
            className="text-sm font-medium text-amber-500 hover:text-amber-400 transition-colors"
          >
            Сегодня
          </button>
        </div>
      }
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
          return <Icon className="h-4 w-4" />;
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
