import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BLANK_HOTEL, type TemplateHotel } from './templateHotels';

interface Props {
  hotels: TemplateHotel[];
  onChange: (hotels: TemplateHotel[]) => void;
}

/** The club template's hotel list: printed on every show's premium and public page. */
export function TemplateHotelsEditor({ hotels, onChange }: Props) {
  function update(index: number, field: keyof TemplateHotel, value: string) {
    onChange(hotels.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium">Hotels</legend>
      {hotels.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No hotels yet. Hotels you add here appear on each show&apos;s premium and public page.
        </p>
      )}
      {hotels.map((hotel, index) => {
        const n = index + 1;
        return (
          <div key={index} className="border rounded-md p-3 space-y-2">
            <div className="space-y-1">
              <Label htmlFor={`hotel-${n}-name`} className="text-xs">
                Hotel {n} name
              </Label>
              <Input
                id={`hotel-${n}-name`}
                value={hotel.name}
                onChange={e => update(index, 'name', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`hotel-${n}-address`} className="text-xs">
                  Hotel {n} address
                </Label>
                <Input
                  id={`hotel-${n}-address`}
                  value={hotel.address}
                  onChange={e => update(index, 'address', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`hotel-${n}-phone`} className="text-xs">
                  Hotel {n} phone
                </Label>
                <Input
                  id={`hotel-${n}-phone`}
                  type="tel"
                  value={hotel.phone}
                  onChange={e => update(index, 'phone', e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onChange(hotels.filter((_, i) => i !== index))}
            >
              <Trash2 className="w-4 h-4 mr-1" /> Remove hotel {n}
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" onClick={() => onChange([...hotels, BLANK_HOTEL])}>
        <Plus className="w-4 h-4 mr-1" /> Add hotel
      </Button>
    </fieldset>
  );
}
