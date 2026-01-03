import React from 'react';
import { Card } from '../ui/card';
// import { Separator } from '../ui/separator';
import { Mail, Phone, MapPin } from 'lucide-react';

interface ContactInfoProps {
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  cardClassName?: string;
}

const ContactInfo: React.FC<ContactInfoProps> = ({ email, phone, address, city, state, zipCode, cardClassName }) => (
  <Card className={`h-full ${cardClassName || ''}`}>
    <div className="p-6 h-full flex flex-col justify-between">
      <h2 className="text-xl font-bold mb-6">Contact Information</h2>
      <div className="space-y-6">
        {/* Email */}
        {email && (
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Email</h3>
              <a 
                href={`mailto:${email}`} 
                className="text-foreground hover:text-primary transition-colors duration-200"
              >
                {email}
              </a>
            </div>
          </div>
        )}
        
        {/* Phone */}
        {phone && (
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
              <Phone className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Phone</h3>
              <a 
                href={`tel:${phone.replace(/[^\d]/g, '')}`}
                className="text-foreground hover:text-primary transition-colors duration-200"
              >
                {phone}
              </a>
            </div>
          </div>
        )}
        
        {/* Address */}
        {(address || city || state || zipCode) && (
          <div className="flex items-start space-x-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mt-0.5">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Address</h3>
              <div className="text-foreground">
                {address && <p>{address}</p>}
                {(city || state || zipCode) && (
                  <p>
                    {[city, state, zipCode].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </Card>
);

export default ContactInfo;
