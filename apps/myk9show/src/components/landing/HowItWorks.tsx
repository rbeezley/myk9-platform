import { Search, ClipboardCheck, Trophy, BarChart3 } from 'lucide-react';

const steps = [
  {
    number: 1,
    title: 'Browse',
    description: 'Find shows by date, location, or organization',
    icon: Search,
  },
  {
    number: 2,
    title: 'Enter',
    description: 'Register your dogs in seconds — we remember your info',
    icon: ClipboardCheck,
  },
  {
    number: 3,
    title: 'Compete',
    description: 'Live scoring, run orders, and results on show day',
    icon: Trophy,
  },
  {
    number: 4,
    title: 'Track',
    description: 'Titles, health records, and career history — all in one place',
    icon: BarChart3,
  },
];

export default function HowItWorks() {
  return (
    <section className="py-16 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 list-none p-0">
          {steps.map(step => (
            <li key={step.number} className="text-center">
              <div className="flex flex-col items-center">
                <div
                  className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4"
                  aria-hidden="true"
                >
                  <step.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="text-sm font-bold text-primary mb-1" aria-hidden="true">
                  Step {step.number}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm max-w-[200px]">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
