/**
 * Personalized time-of-day greetings for dashboards.
 * Returns a random greeting from the appropriate time bucket.
 */
export function getLoginGreeting(firstName: string): string {
  const hour = new Date().getHours();

  let greetings: string[];

  if (hour >= 5 && hour < 12) {
    // Morning (5am–11:59am)
    greetings = [
      `Good morning, ${firstName}. Coffee's on.`,
      `Rise and shine, ${firstName}!`,
      `${firstName}, you're an early bird today.`,
      `Good morning. Ready to make today count?`,
      `${firstName}, the day is yours.`,
      `Morning, ${firstName}. Let's build something great.`,
      `Welcome back, ${firstName}. Fresh start ahead.`,
    ];
  } else if (hour >= 12 && hour < 17) {
    // Afternoon (12pm–4:59pm)
    greetings = [
      `Good afternoon, ${firstName}. Keep the momentum going.`,
      `${firstName}, you're in the zone now.`,
      `Afternoon check-in, ${firstName}. You've got this.`,
      `${firstName}, halfway through and crushing it.`,
      `Welcome back, ${firstName}. Let's keep it rolling.`,
      `${firstName}, the best is yet to come today.`,
      `Good afternoon, friend. Ready for round two?`,
    ];
  } else {
    // Evening (5pm–11:59pm) and late night
    greetings = [
      `Evening, ${firstName}. Final push of the day?`,
      `${firstName}, end strong tonight.`,
      `Welcome back for the home stretch, ${firstName}.`,
      `${firstName}, you're wrapping up a great day.`,
      `Evening vibes, ${firstName}. You earned this.`,
      `${firstName}, almost there. Keep the fire alive.`,
    ];
  }

  return greetings[Math.floor(Math.random() * greetings.length)];
}
