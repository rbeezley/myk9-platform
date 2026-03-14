import type { FAQ } from '../types';

const faqs: FAQ[] = [
  {
    question: 'What does myK9Show cost?',
    answer:
      'myK9Show is free for browsing shows, entering events, and viewing results. Premium ($4.99/month) adds title tracking, health records, training journals, and performance stats. No per-dog fees — one subscription covers all your dogs.',
  },
  {
    question: 'Does it work offline at the show grounds?',
    answer:
      "Yes. Our companion app myK9Q is built for show day — it works fully offline with automatic sync when you're back online. Scores, run orders, and check-ins all work without an internet connection.",
  },
  {
    question: 'Which organizations do you support?',
    answer:
      "We currently support AKC, UKC, and ASCA events. More organizations are coming — if yours isn't listed, let us know through the club onboarding form.",
  },
  {
    question: 'How do I get my club set up?',
    answer:
      "Fill out the club onboarding form below and we'll get you running — usually within 24 hours. We'll help migrate your existing data and walk you through setup.",
  },
  {
    question: 'Is my data safe?',
    answer:
      'Your data is stored securely on Supabase (built on AWS) with encryption at rest and in transit. We never share your personal information. You can export your data anytime.',
  },
  {
    question: 'Can I use it on my phone or tablet?',
    answer:
      'Absolutely. myK9Show works in any modern browser on phone, tablet, or desktop. For show day, our companion app myK9Q is optimized for tablets at ringside.',
  },
];

export default faqs;
