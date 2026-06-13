import {
  ClipboardCheck,
  Calendar,
  Trophy,
  Timer,
  Award,
  FileText,
  Mail,
  LineChart,
  CloudCog as CloudCheck,
} from 'lucide-react';

const features = [
  {
    id: 1,
    title: 'Simplified Registration',
    description:
      'Streamline your event registration process with our intuitive digital forms and automatic validation.',
    icon: ClipboardCheck,
    color: 'blue',
  },
  {
    id: 2,
    title: 'Event & Ring Coordination',
    description:
      'Efficiently manage multiple rings and concurrent events with our intelligent scheduling system.',
    icon: Calendar,
    color: 'indigo',
  },
  {
    id: 3,
    title: 'Flexible Scoring Engine',
    description:
      'Configure scoring rules for any dog sport or competition type with our adaptable scoring system.',
    icon: Trophy,
    color: 'purple',
  },
  {
    id: 4,
    title: 'Real-time Scoring & Timing',
    description: 'Track performance in real-time with accurate timing and instant scoring updates.',
    icon: Timer,
    color: 'rose',
  },
  {
    id: 5,
    title: 'Title & Qualification Tracking',
    description:
      'Automatically track and validate titles, points, and qualifications across events.',
    icon: Award,
    color: 'amber',
  },
  {
    id: 6,
    title: 'Running Order Optimization',
    description:
      'Resolve scheduling conflicts and optimize running orders with AI-powered algorithms.',
    icon: FileText,
    color: 'emerald',
  },
  {
    id: 7,
    title: 'Participant Communication',
    description: 'Keep handlers informed with automated updates, notifications, and announcements.',
    icon: Mail,
    color: 'cyan',
  },
  {
    id: 8,
    title: 'Data Analytics & History',
    description:
      'Access comprehensive historical data and insightful analytics to improve future events.',
    icon: LineChart,
    color: 'teal',
  },
  {
    id: 9,
    title: 'Paperless Operations',
    description:
      'Reduce environmental impact and improve efficiency with end-to-end digital processes.',
    icon: CloudCheck,
    color: 'green',
  },
];

const getIconColor = (color: string) => {
  switch (color) {
    case 'blue':
      return 'text-info bg-info/10 ';
    case 'indigo':
      return 'text-indigo-500 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30';
    case 'purple':
      return 'text-purple-500 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30';
    case 'rose':
      return 'text-rose-500 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30';
    case 'amber':
      return 'text-warning bg-warning/10 ';
    case 'emerald':
      return 'text-emerald-500 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30';
    case 'cyan':
      return 'text-cyan-500 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/30';
    case 'teal':
      return 'text-teal-500 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30';
    case 'green':
      return 'text-green-500 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
    default:
      return 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800';
  }
};

export default function Features() {
  return (
    <section id="features" className="py-16 md:py-24 bg-gray-50 dark:bg-warm-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            How We Solve Your Challenges
          </h2>
          <p className="text-xl text-muted-foreground">
            Our platform addresses the unique pain points of dog show management with innovative
            solutions.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map(feature => (
            <div
              key={feature.id}
              className="bg-card dark:bg-warm-950 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 dark:border-warm-600"
            >
              <div
                className={`p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4 ${getIconColor(feature.color)}`}
              >
                <feature.icon size={24} />
              </div>

              <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>

              <p className="text-gray-600 dark:text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
