import { Document } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../types/premium-types';
import { HeroCover } from './HeroCover';
import { TemplateBody } from './TemplateBody';

interface Props {
  premium: GeneratedPremium;
}

export function UKCPremiumTemplate({ premium }: Props) {
  return (
    <Document>
      <HeroCover data={premium} />
      <TemplateBody data={premium} org="UKC" />
    </Document>
  );
}
