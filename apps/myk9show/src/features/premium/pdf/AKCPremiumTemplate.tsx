import { Document } from '@react-pdf/renderer';
import type { GeneratedPremium } from '../../../types/premium-types';
import { HeroCover } from './HeroCover';
import { TemplateBody } from './TemplateBody';

interface Props {
  premium: GeneratedPremium;
  inkSaver?: boolean;
}

export function AKCPremiumTemplate({ premium, inkSaver = false }: Props) {
  return (
    <Document>
      <HeroCover data={premium} inkSaver={inkSaver} />
      <TemplateBody data={premium} org="AKC" inkSaver={inkSaver} />
    </Document>
  );
}
