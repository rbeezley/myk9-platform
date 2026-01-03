import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type FAQItem = {
  id: number;
  question: string;
  answer: string;
};

const faqItems: FAQItem[] = [
  {
    id: 1,
    question: 'What types of dog events does myK9Show support?',
    answer: 'myK9Show supports a wide range of dog events including conformation shows, obedience trials, agility competitions, rally, flyball, dock diving, barn hunt, herding trials, and more. Our flexible platform can be configured for virtually any dog sport or competition type.'
  },
  {
    id: 2,
    question: 'How does the registration process work?',
    answer: 'Our streamlined registration system allows exhibitors to enter multiple dogs in various events with just a few clicks. The platform validates entries against event rules and eligibility requirements automatically. Organizers can set up custom entry forms with required documentation, collect fees via integrated payment processing, and manage entry approvals from a central dashboard.'
  },
  {
    id: 3,
    question: 'Is there a fee to search for shows on the platform?',
    answer: 'No, searching for shows is completely free. Anyone can use our platform to discover upcoming events, view details, and check eligibility requirements without creating an account. Fees only apply when registering for events or accessing premium organizer features.'
  },
  {
    id: 4,
    question: 'How does the scoring system handle different competition rules?',
    answer: 'Our scoring engine is highly configurable to accommodate the unique rules of different dog sports. Organizers can set up custom scoring templates with specific point structures, time calculations, fault deductions, and qualification thresholds. The system supports both objective scoring (time, faults, points) and subjective judging with customizable rubrics.'
  },
  {
    id: 5,
    question: 'Can myK9Show help resolve scheduling conflicts?',
    answer: 'Yes, our intelligent scheduling system automatically identifies potential conflicts when a handler or dog is entered in multiple events with overlapping times. The platform suggests optimal running order solutions and allows organizers to make informed adjustments to minimize wait times and ensure smooth event flow.'
  },
  {
    id: 6,
    question: 'What reporting and analytics features are available?',
    answer: 'myK9Show provides comprehensive reporting tools for both organizers and participants. Organizers can access real-time event metrics, financial summaries, participant demographics, and historical comparisons. Exhibitors can view their complete competition history, qualification progress, points accumulation toward titles, and performance trends over time.'
  }
];

export default function FAQ() {
  const [openItems, setOpenItems] = useState<number[]>([1]); // First item open by default

  const toggleItem = (id: number) => {
    setOpenItems(prevOpen => 
      prevOpen.includes(id)
        ? prevOpen.filter(itemId => itemId !== id)
        : [...prevOpen, id]
    );
  };

  return (
    <section id="faq" className="py-16 md:py-24 bg-white dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-xl text-gray-700 dark:text-gray-300">
            Find answers to common questions about our platform
          </p>
        </div>
        
        <div className="space-y-4">
          {faqItems.map((item) => (
            <div 
              key={item.id} 
              className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
            >
              <button
                className="w-full flex justify-between items-center p-6 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                onClick={() => toggleItem(item.id)}
                aria-expanded={openItems.includes(item.id)}
              >
                <span className="text-lg font-medium text-gray-900 dark:text-white">
                  {item.question}
                </span>
                {openItems.includes(item.id) ? (
                  <ChevronUp className="flex-shrink-0 ml-2 text-gray-500 dark:text-gray-400" size={20} />
                ) : (
                  <ChevronDown className="flex-shrink-0 ml-2 text-gray-500 dark:text-gray-400" size={20} />
                )}
              </button>
              
              {openItems.includes(item.id) && (
                <div className="p-6 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-gray-700 dark:text-gray-300">
                    {item.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div className="mt-10 text-center">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Still have questions? We're here to help.
          </p>
          <button className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors shadow-lg hover:shadow-xl">
            Contact Support
          </button>
        </div>
      </div>
    </section>
  );
}
