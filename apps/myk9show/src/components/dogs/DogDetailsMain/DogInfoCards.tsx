import React from 'react';
import { Activity, Heart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import EditableValue from './EditableValue';
import { formatDisplayDate } from './utils';
import type { DogInfoCardsProps } from './types';

const DogInfoCards: React.FC<DogInfoCardsProps> = ({ dog, onEditPanelOpen }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Basic Dog Information Card */}
      <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border
                       rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                       hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />

        <div className="relative space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-pink-500/10 to-rose-500/5 rounded-xl
                           hover:scale-110 transition-transform duration-200">
              <Heart className="h-5 w-5 text-pink-500 hover:text-rose-500 transition-colors duration-200" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              About {dog.callName}
            </h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Sex
              </span>
              <EditableValue
                value={dog.gender}
                onEdit={onEditPanelOpen}
                formatFn={(val) => val.charAt(0).toUpperCase() + val.slice(1)}
              />
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Date of Birth
              </span>
              <EditableValue
                value={dog.dateOfBirth}
                onEdit={onEditPanelOpen}
                formatFn={formatDisplayDate}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Physical Characteristics Card */}
      <Card className="group bg-gradient-to-br from-card/95 to-card/80 apple-subtle-card-border
                       rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                       hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.02] to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />

        <div className="relative space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-xl">
              <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Physical Characteristics
            </h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Height
              </span>
              <EditableValue
                value={dog.height}
                onEdit={onEditPanelOpen}
                suffix='"'
              />
            </div>
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Weight
              </span>
              <EditableValue
                value={dog.weight}
                onEdit={onEditPanelOpen}
                suffix=" lbs"
              />
            </div>
            <div className="flex items-center justify-between py-3" style={{ borderBottom: '0.5px solid rgba(128, 128, 128, 0.2)' }}>
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Color
              </span>
              <EditableValue
                value={dog.color}
                onEdit={onEditPanelOpen}
              />
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">
                Microchip
              </span>
              <EditableValue
                value={dog.microchip}
                onEdit={onEditPanelOpen}
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default DogInfoCards;
