import React from 'react';
import { MoreVertical, Edit2, Mail, Phone, MapPin } from 'lucide-react';

interface ClubInfoCardProps {
  logo: string;
  name: string;
  clubNumber: string;
  email: string;
  phone: string;
  address: string;
  onEdit?: () => void;
  onMenu?: () => void;
}

const ClubInfoCard: React.FC<ClubInfoCardProps> = ({
  logo,
  name,
  clubNumber,
  email,
  phone,
  address,
  onEdit,
  onMenu,
}) => (
  <div className="bg-white rounded-xl shadow p-6 mb-6 flex flex-col gap-4 relative">
    {/* Action Icons */}
    <div className="absolute top-4 right-4 flex gap-2">
      <button className="p-2 hover:bg-muted rounded-full" onClick={onEdit} title="Edit Club Info">
        <Edit2 size={18} />
      </button>
      <button className="p-2 hover:bg-muted rounded-full" onClick={onMenu} title="More Actions">
        <MoreVertical size={18} />
      </button>
    </div>
    {/* Logo and Name */}
    <div className="flex items-center gap-6">
      <img src={logo} alt="Club Logo" className="w-20 h-20 rounded-full object-cover border" />
      <div>
        <h2 className="text-2xl font-bold mb-1">{name}</h2>
        <div className="text-muted-foreground text-sm">Club No: {clubNumber}</div>
      </div>
    </div>
    {/* Contact Info */}
    <div className="flex flex-wrap gap-8 mt-2">
      <div className="flex items-center gap-2 text-sm">
        <Mail className="text-primary" size={18} />
        <span>{email}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Phone className="text-primary" size={18} />
        <span>{phone}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <MapPin className="text-primary" size={18} />
        <span>{address}</span>
      </div>
    </div>
  </div>
);

export default ClubInfoCard;
