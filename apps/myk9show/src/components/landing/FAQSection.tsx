import React from 'react';
import type { FAQ } from '@/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface FAQSectionProps {
  faqs: FAQ[];
}

const FAQSection: React.FC<FAQSectionProps> = ({ faqs }) => {
  return (
    <section className="py-16 bg-background text-foreground transition-colors duration-300 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4">
          {faqs.map((faq, idx) => (
            <AccordionItem
              value={`item-${idx}`}
              key={idx}
              className="border border-border/50 rounded-lg px-6 py-2 bg-card/50 backdrop-blur-sm hover:bg-card/80 hover:border-primary/20 transition-all duration-300 hover:shadow-md"
            >
              <AccordionTrigger className="text-left hover:no-underline group">
                <div className="flex items-center gap-3">
                  <span className="group-hover:text-primary transition-colors duration-300">
                    {faq.question}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4 pb-2">
                <div className="bg-muted/30 rounded-lg p-4 border-l-4 border-primary/30">
                  <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-12 text-center p-6 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl border border-primary/10">
          <p className="font-semibold text-card-foreground mb-1">Still have questions?</p>
          <p className="text-muted-foreground">Reach out anytime — we're happy to help.</p>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
