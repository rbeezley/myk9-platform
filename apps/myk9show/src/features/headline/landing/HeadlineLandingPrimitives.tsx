import type { ReactNode } from 'react';

export function SectionHead({
  index,
  kicker,
  title,
  children,
}: {
  index: number;
  kicker: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  const folio = String(index).padStart(2, '0');
  return (
    <div className="hd-section-head in">
      <div className="hd-folio">
        <span className="pct">§ {folio}</span>
        {folio}.
      </div>
      <div>
        <div className="hd-h2-kicker">{kicker}</div>
        <h2 className="hd-h2">{title}</h2>
        {children}
      </div>
    </div>
  );
}
