import type { SVGProps } from 'react';

interface MyK9ShowMarkProps extends SVGProps<SVGSVGElement> {
  title?: string;
}

export function MyK9ShowMark({ title, ...props }: MyK9ShowMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...props}
    >
      <path
        d="M32 6.5C18.2 6.5 7 17.7 7 31.5s11.2 25 25 25c4.9 0 9.5-1.4 13.3-3.9"
        stroke="var(--myk9-logo-accent, currentColor)"
        strokeWidth="5.25"
        strokeLinecap="round"
      />
      <path
        d="M45.5 52.5 56 58"
        stroke="var(--myk9-logo-accent, currentColor)"
        strokeWidth="5.25"
        strokeLinecap="round"
      />
      <g
        stroke="var(--myk9-logo-dog, var(--myk9-logo-accent, currentColor))"
        strokeWidth="2.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M27.5 23.5v-7l6.5 6.5h10.2c4.8 0 7.2 2.4 7.2 5.4 0 3.4-3.4 6.1-8.5 6.1h-6.1" />
        <path d="M28.8 35.2c-4.4 2.2-7.2 6.4-7.8 12.1" />
        <path d="M36.6 35.3c3 3.4 4.1 8.2 3.3 14.6" />
        <path d="M22.2 50.5h22.4" />
        <path d="M21.9 43.8c-4.8-1.4-7.1-4.6-6.3-8.9" />
        <path d="M28.7 50.3c.9-3.9.4-6.4-1.7-7.6" />
        <path d="M47.2 28.2h.1" />
      </g>
      <g fill="var(--myk9-logo-node, var(--myk9-logo-accent, currentColor))">
        <circle cx="27.5" cy="31.4" r="2.35" />
        <circle cx="36.8" cy="34.5" r="2.35" />
        <circle cx="40" cy="50.1" r="2.35" />
        <circle cx="21.2" cy="47.5" r="2.35" />
        <circle cx="15.9" cy="34.8" r="2.35" />
      </g>
    </svg>
  );
}
