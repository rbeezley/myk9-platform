import React from 'react';
import { Link } from 'react-router-dom';

interface LegalPlaceholderPageProps {
  title: string;
}

const LegalPlaceholderPage: React.FC<LegalPlaceholderPageProps> = ({ title }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-2 pt-20">
      <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
        <div className="flex justify-center mb-4">
          <Link
            to="/"
            className="text-3xl font-bold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded transition"
          >
            myK9Show
          </Link>
        </div>
        <h1 className="text-2xl font-bold mb-4">{title}</h1>
        <p className="text-muted-foreground">
          This page is under construction. Please check back soon.
        </p>
      </div>
    </div>
  );
};

export default LegalPlaceholderPage;
