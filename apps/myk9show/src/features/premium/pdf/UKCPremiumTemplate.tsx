import { Document } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../types/premium-types';
import { HeroCover } from './HeroCover';
import { TemplateBody } from './TemplateBody';

interface Props {
  premium: GeneratedPremium;
  inkSaver?: boolean;
}

export function UKCPremiumTemplate({ premium, inkSaver = false }: Props) {
  return (
    <Document>
      <HeroCover data={premium} inkSaver={inkSaver} />
      <TemplateBody data={premium} org="UKC" inkSaver={inkSaver} />
    </Document>
  );
}
