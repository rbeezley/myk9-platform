import React from "react";
import type { Feature } from "@/types";

interface FeaturesSectionProps {
  features: Feature[];
}

const FeaturesSection: React.FC<FeaturesSectionProps> = ({ features }) => {
  
  
  return (
    <section className="py-16 bg-background text-foreground transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold mb-8 text-center">Comprehensive Show Management</h2>
        <p className="mb-12 text-center text-muted-foreground">Everything you need to run successful dog shows, from registration to results.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-8 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 cursor-pointer"
            >
              
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 relative overflow-hidden">
                  {/* Subtle pulse ring effect */}
                  <div className="absolute inset-0 rounded-2xl bg-primary/20 scale-0 group-hover:scale-150 opacity-0 group-hover:opacity-100 transition-all duration-700" />
                  <div className="text-primary relative z-10 group-hover:scale-110 transition-transform duration-300">
                    {feature.icon}
                  </div>
                </div>
              </div>
              
              <h3 className="text-xl font-semibold mb-3 text-card-foreground group-hover:text-primary transition-colors duration-300 relative">
                {feature.title}
                {/* Subtle underline animation */}
                <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-secondary opacity-0 group-hover:w-full group-hover:opacity-100 transition-all duration-500" />
              </h3>
              
              <p className="text-muted-foreground relative group-hover:text-card-foreground/80 transition-colors duration-300">
                {feature.description}
              </p>
              
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
