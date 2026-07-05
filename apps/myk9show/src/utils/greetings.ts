/**
 * Personalized time-of-day greetings for dashboards.
 */
export function getLoginGreeting(firstName: string): string {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return `Good morning, ${firstName}.`;
  }

  if (hour >= 12 && hour < 17) {
    return `Good afternoon, ${firstName}.`;
  }

  return `Good evening, ${firstName}.`;
}
