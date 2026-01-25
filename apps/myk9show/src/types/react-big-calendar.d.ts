declare module 'react-big-calendar' {
  import { ComponentType } from 'react';
  
  export interface Event {
    id?: string;
    title: string;
    start: Date;
    end: Date;
    resource?: Record<string, unknown>;
  }
  
  export type ViewName = 'month' | 'week' | 'work_week' | 'day' | 'agenda';
  export type View = ViewName;
  
  export const Views: Record<string, ViewName>;
  
  export interface Localizer {
    formats: Record<string, string>;
    messages: Record<string, string>;
    startOfWeek: () => number;
    format: (value: Date, format: string, culture?: string) => string;
    parse: (str: string, format: string, culture?: string) => Date;
  }

  export interface CalendarComponents {
    event?: React.ComponentType<{
      event: Event;
      title: string;
    }>;
    agenda?: {
      event?: React.ComponentType<{ event: Event }>;
      date?: React.ComponentType<{ date: Date }>;
      time?: React.ComponentType<{ event: Event }>;
    };
    toolbar?: React.ComponentType<{
      label: string;
      localizer: Localizer;
      onNavigate: (action: 'PREV' | 'NEXT' | 'TODAY' | 'DATE') => void;
      onView: (view: ViewName) => void;
      view: ViewName;
      views: ViewName[];
    }>;
  }

  export interface EventPropGetter {
    (event: Event, start: Date, end: Date, isSelected: boolean): {
      className?: string;
      style?: React.CSSProperties;
    };
  }

  export interface CalendarProps {
    localizer: Localizer;
    events: Event[];
    views?: ViewName[];
    defaultView?: ViewName;
    view?: ViewName;
    date?: Date;
    onSelectEvent?: (event: Event) => void;
    onView?: (view: ViewName) => void;
    onNavigate?: (date: Date) => void;
    style?: React.CSSProperties;
    className?: string;
    startAccessor?: string;
    endAccessor?: string;
    popup?: boolean;
    components?: CalendarComponents;
    eventPropGetter?: EventPropGetter;
  }
  
  export const Calendar: ComponentType<CalendarProps>;
  
  interface MomentInstance {
    locale: (locale?: string) => void;
    format: (format?: string) => string;
    startOf: (period: string) => MomentInstance;
    endOf: (period: string) => MomentInstance;
    add: (amount: number, period: string) => MomentInstance;
    subtract: (amount: number, period: string) => MomentInstance;
    isSame: (date: Date | string, period?: string) => boolean;
    toDate: () => Date;
    valueOf: () => number;
  }

  export function momentLocalizer(moment: typeof import('moment')): Localizer;

  export interface DateFnsLocalizerArgs {
    format: typeof import('date-fns').format;
    parse: typeof import('date-fns').parse;
    startOfWeek: typeof import('date-fns').startOfWeek;
    getDay: typeof import('date-fns').getDay;
    locales: Record<string, Locale>;
  }

  export function dateFnsLocalizer(args: DateFnsLocalizerArgs): Localizer;
}