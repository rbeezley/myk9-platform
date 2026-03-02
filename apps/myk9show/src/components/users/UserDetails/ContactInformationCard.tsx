import React from 'react';
import { User } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { UserFormData } from './userDetailsTypes';

interface ContactInformationCardProps {
  firstName: string;
  lastName: string;
  email: string;
  formData: UserFormData;
}

const ContactInformationCard: React.FC<ContactInformationCardProps> = ({
  firstName,
  lastName,
  email,
  formData,
}) => {
  return (
    <Card
      className="group bg-gradient-to-br from-card/95 to-card/80 myk9-subtle-card-border
                     rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                     hover:shadow-xl hover:-translate-y-1 hover:border-primary/20"
    >
      <div
        className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-transparent
                      opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl"
      />

      <div className="relative space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
            <User className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Contact Information
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-5">
          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              First Name
            </span>
            <span className="text-sm font-medium text-foreground">
              {firstName || 'Not provided'}
            </span>
          </div>

          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              Last Name
            </span>
            <span className="text-sm font-medium text-foreground">
              {lastName || 'Not provided'}
            </span>
          </div>

          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              Email
            </span>
            {email ? (
              <a
                href={`mailto:${email}`}
                className="text-sm font-medium text-primary hover:text-primary/80
                           transition-colors duration-200 hover:underline truncate"
              >
                {email}
              </a>
            ) : (
              <span className="text-sm font-medium text-foreground">Not provided</span>
            )}
          </div>

          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              Phone
            </span>
            {formData.phone ? (
              <a
                href={`tel:${formData.phone.replace(/[^\d]/g, '')}`}
                className="text-sm font-medium text-primary hover:text-primary/80
                           transition-colors duration-200 hover:underline"
              >
                {formData.phone}
              </a>
            ) : (
              <span className="text-sm font-medium text-foreground">Not provided</span>
            )}
          </div>

          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              Street
            </span>
            <span className="text-sm font-medium text-foreground">
              {formData.address || 'Not provided'}
            </span>
          </div>

          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              City
            </span>
            <span className="text-sm font-medium text-foreground">
              {formData.city || 'Not provided'}
            </span>
          </div>

          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              State
            </span>
            <span className="text-sm font-medium text-foreground">
              {formData.state || 'Not provided'}
            </span>
          </div>

          <div className="flex flex-col pb-3 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
              Zip Code
            </span>
            <span className="text-sm font-medium text-foreground">
              {formData.zipCode || 'Not provided'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ContactInformationCard;
