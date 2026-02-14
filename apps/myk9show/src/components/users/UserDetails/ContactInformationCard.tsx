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
    <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border
                     rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                     hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-transparent
                      opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />

      <div className="relative space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl">
            <User className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Contact Information
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Personal Details Column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                First Name
              </span>
              <span className="text-sm font-medium text-foreground">
                {firstName || 'Not provided'}
              </span>
            </div>
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Last Name
              </span>
              <span className="text-sm font-medium text-foreground">
                {lastName || 'Not provided'}
              </span>
            </div>
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Email
              </span>
              <a href={`mailto:${email}`}
                 className="text-sm font-medium text-primary dark:text-white hover:text-primary/80 dark:hover:text-white/80
                          transition-colors duration-200 hover:underline">
                {email || 'Not provided'}
              </a>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Phone
              </span>
              {formData.phone ? (
                <a href={`tel:${formData.phone.replace(/[^\d]/g, '')}`}
                   className="text-sm font-medium text-primary dark:text-white hover:text-primary/80 dark:hover:text-white/80
                            transition-colors duration-200 hover:underline">
                  {formData.phone}
                </a>
              ) : (
                <span className="text-sm font-medium text-foreground">Not provided</span>
              )}
            </div>
          </div>

          {/* Address Column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Street
              </span>
              <span className="text-sm font-medium text-foreground">
                {formData.address || 'Not provided'}
              </span>
            </div>
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                City
              </span>
              <span className="text-sm font-medium text-foreground">
                {formData.city || 'Not provided'}
              </span>
            </div>
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                State
              </span>
              <span className="text-sm font-medium text-foreground">
                {formData.state || 'Not provided'}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Zip Code
              </span>
              <span className="text-sm font-medium text-foreground">
                {formData.zipCode || 'Not provided'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ContactInformationCard;
