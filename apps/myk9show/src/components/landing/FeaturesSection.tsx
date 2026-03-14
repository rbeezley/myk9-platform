import React from 'react';
import type { Feature } from '@/types';

interface FeaturesSectionProps {
  features: Feature[];
}

const FeaturesSection: React.FC<FeaturesSectionProps> = ({ features }) => {
  return (
    <section className="py-16 bg-background text-foreground transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-8 text-center">Comprehensive Show Management</h2>
        <p className="mb-12 text-center text-muted-foreground">
          Everything you need to run successful dog shows, from registration to results.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-8 shadow-sm backdrop-blur-xl transition-shadow duration-300 hover:shadow-md"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center mb-6">
                <div className="text-primary">{feature.icon}</div>
              </div>

              <h3 className="text-xl font-semibold mb-3 text-card-foreground">{feature.title}</h3>

              <p className="text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
