/**
 * Time utilities for time picker component
 * Based on OpenStatus time picker implementation
 */

export type Period = "AM" | "PM";

/**
 * Regular expression to check for valid hour format (01-23)
 */
export function isValidHour(value: string) {
  return /^(0[0-9]|1[0-9]|2[0-3])$/.test(value);
}

/**
 * Regular expression to check for valid 12 hour format (01-12)
 */
export function isValid12Hour(value: string) {
  return /^(0[1-9]|1[0-2])$/.test(value);
}

/**
 * Regular expression to check for valid minute format (00-59)
 */
export function isValidMinute(value: string) {
  return /^[0-5][0-9]$/.test(value);
}

/**
 * Convert time string to Date object
 */
export function getArrowByType(type: "up" | "down", step: number) {
  return type === "up" ? step : -step;
}

/**
 * Set date time and update the date object
 */
export function setDateByType(
  date: Date | undefined,
  type: "hour" | "minute" | "second",
  value: number,
  period?: Period
) {
  if (!date) return new Date();
  
  const newDate = new Date(date);
  
  if (type === "hour") {
    if (period) {
      // 12-hour format
      let hour = value;
      if (period === "PM" && hour !== 12) hour += 12;
      if (period === "AM" && hour === 12) hour = 0;
      newDate.setHours(hour);
    } else {
      // 24-hour format
      newDate.setHours(value);
    }
  } else if (type === "minute") {
    newDate.setMinutes(value);
  } else if (type === "second") {
    newDate.setSeconds(value);
  }
  
  return newDate;
}

/**
 * Get display value for time input
 */
export function getDateByType(date: Date | undefined, type: "hour" | "minute") {
  if (!date) return "00";
  
  if (type === "hour") {
    const hour = date.getHours();
    return hour.toString().padStart(2, "0");
  } else if (type === "minute") {
    const minute = date.getMinutes();
    return minute.toString().padStart(2, "0");
  }
  
  return "00";
}

/**
 * Get 12-hour format hour
 */
export function get12HourFormat(date: Date | undefined) {
  if (!date) return { hour: "12", period: "AM" as Period };
  
  const hour = date.getHours();
  const period: Period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  
  return {
    hour: hour12.toString().padStart(2, "0"),
    period
  };
}

/**
 * Convert MM:SS string to Date object (for time-only inputs)
 */
export function convertTimeStringToDate(timeString: string): Date | undefined {
  if (!timeString || !timeString.includes(':')) return undefined;
  
  const [minutes, seconds] = timeString.split(':');
  const minutesNum = parseInt(minutes, 10);
  const secondsNum = parseInt(seconds, 10);
  
  if (isNaN(minutesNum) || isNaN(secondsNum) || minutesNum < 0 || minutesNum > 59 || secondsNum < 0 || secondsNum > 59) {
    return undefined;
  }
  
  const date = new Date();
  date.setHours(0, minutesNum, secondsNum, 0);
  return date;
}

/**
 * Convert Date object to MM:SS string (for time-only inputs)
 */
export function convertDateToTimeString(date: Date | undefined): string {
  if (!date) return '';
  
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}