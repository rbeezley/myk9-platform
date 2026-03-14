import { Dog, Calendar, Building2 } from 'lucide-react';
import type { Feature } from '../types';

const features: Feature[] = [
  {
    icon: <Dog className="w-8 h-8 text-primary" width={32} height={32} />,
    label: 'For Exhibitors',
    title: 'Enter shows, track titles, manage your dogs',
    description:
      'Pre-filled entries, competition history, health records, and title tracking — everything you need before and after show day.',
  },
  {
    icon: <Calendar className="w-8 h-8 text-primary" width={32} height={32} />,
    label: 'For Secretaries',
    title: 'Set up shows, manage entries, publish results',
    description:
      'Smart defaults, class templates, judge assignments. The software handles the logistics so you can handle the show.',
  },
  {
    icon: <Building2 className="w-8 h-8 text-primary" width={32} height={32} />,
    label: 'For Clubs',
    title: 'One platform for your entire trial program',
    description:
      "Registration, payments, scheduling, and reporting. Get your club running on myK9 in a day — we'll help you set up.",
  },
];

export default features;
