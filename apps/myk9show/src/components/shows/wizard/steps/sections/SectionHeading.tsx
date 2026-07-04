import React from 'react';

/* ------------------------------------------------------------------ */
/*  SectionHeading — the one heading style shared by every Step-1      */
/*  group. Flat by default (DESIGN.md: no card chrome, no side-stripe  */
/*  headings). Kept in one place so the four groups can't drift.       */
/* ------------------------------------------------------------------ */

interface SectionHeadingProps {
  children: React.ReactNode;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({ children }) => (
  <h3 className="text-lg font-semibold mb-4 text-foreground">{children}</h3>
);
