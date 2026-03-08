import React, { useMemo } from 'react';
import { Activity, Heart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import EditableValue from './EditableValue';
import { formatDisplayDate } from './utils';
import { FilterableFieldGrid, type FieldDefinition } from '@/components/common/FilterableFieldGrid';
import type { DogInfoCardsProps } from './types';

const DogInfoCards: React.FC<DogInfoCardsProps> = ({ dog, onEditPanelOpen }) => {
  const physicalFields: FieldDefinition[] = useMemo(
    () => [
      {
        label: 'Height',
        value: dog.height,
        render: <EditableValue value={dog.height} onEdit={onEditPanelOpen} suffix='"' />,
      },
      {
        label: 'Weight',
        value: dog.weight,
        render: <EditableValue value={dog.weight} onEdit={onEditPanelOpen} suffix=" lbs" />,
      },
      {
        label: 'Color',
        value: dog.color,
        render: <EditableValue value={dog.color} onEdit={onEditPanelOpen} />,
      },
      {
        label: 'Microchip',
        value: dog.microchipNumber,
        render: <EditableValue value={dog.microchipNumber} onEdit={onEditPanelOpen} />,
      },
    ],
    [dog.height, dog.weight, dog.color, dog.microchipNumber, onEditPanelOpen]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Basic Dog Information Card */}
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
            <div
              className="p-2.5 bg-gradient-to-br from-pink-500/10 to-rose-500/5 rounded-xl
                           hover:scale-110 transition-transform duration-200"
            >
              <Heart className="h-5 w-5 text-pink-500 hover:text-rose-500 transition-colors duration-200" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              About {dog.callName}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div className="flex flex-col pb-3 border-b border-border/30">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
                Sex
              </span>
              <EditableValue
                value={dog.gender}
                onEdit={onEditPanelOpen}
                formatFn={val => val.charAt(0).toUpperCase() + val.slice(1)}
              />
            </div>
            <div className="flex flex-col pb-3 border-b border-border/30">
              <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-1">
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
      <Card
        className="group bg-gradient-to-br from-card/95 to-card/80 myk9-subtle-card-border
                       rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                       hover:shadow-xl hover:-translate-y-1 hover:border-primary/20"
      >
        <div
          className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.02] to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl"
        />

        <div className="relative space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-xl">
              <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Physical Characteristics
            </h3>
          </div>

          <FilterableFieldGrid sectionKey="dog-physical" fields={physicalFields} columns={2} />
        </div>
      </Card>
    </div>
  );
};

export default DogInfoCards;
