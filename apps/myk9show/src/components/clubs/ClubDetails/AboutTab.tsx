import React from 'react';
import { Mail, Phone, Globe, MapPin } from 'lucide-react';
import { Club } from '@/types/club-types';
import { normalizeContactDestinations } from './contactDestinations';

interface AboutTabProps {
  club: Club;
}

export const AboutTab: React.FC<AboutTabProps> = ({ club }) => {
  const contact = normalizeContactDestinations(club);
  return (
    <div className="space-y-6">
      {club.description && (
        <div className="text-base text-foreground leading-relaxed">{club.description}</div>
      )}

      {/* Contact Information */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contact.email && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Mail className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Email</div>
                <a
                  href={contact.email}
                  className="text-sm text-foreground hover:text-primary transition-colors"
                >
                  {club.email?.trim()}
                </a>
              </div>
            </div>
          )}

          {contact.phone && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Phone className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Phone</div>
                <a
                  href={contact.phone}
                  className="text-sm text-foreground hover:text-primary transition-colors"
                >
                  {club.phone?.trim()}
                </a>
              </div>
            </div>
          )}

          {contact.website && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Globe className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Website</div>
                <a
                  href={contact.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-foreground hover:text-primary transition-colors"
                >
                  {club.website?.trim()}
                </a>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <MapPin className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Address</div>
              <div className="text-sm text-foreground">
                {[
                  club.address?.street,
                  club.address?.city,
                  club.address?.state,
                  club.address?.zipCode,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
