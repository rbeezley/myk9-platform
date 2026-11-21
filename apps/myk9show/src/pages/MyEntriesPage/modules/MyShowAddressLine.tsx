/**
 * The street address and its Directions link on a My Shows card. The link is
 * built from the street address (`shows.location`) so it lands on the venue's
 * door, not the middle of the city. Renders nothing without a street address:
 * the header's city link stays the fallback.
 *
 * @module MyEntriesPage/modules/MyShowAddressLine
 */

import React from 'react';
import { buildVenueMapsUrls } from '@/utils/venueMaps';

export const MyShowAddressLine: React.FC<{ street: string }> = ({ street }) => (
  <p className="myk9-entries-show-meta">
    <span>{street}</span>
    <a
      href={buildVenueMapsUrls(street).directionsUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Get directions to ${street}`}
      className="inline-flex min-h-[44px] items-center rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      Directions
    </a>
  </p>
);
