import React from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Check } from "lucide-react";

interface MultiSelectPopoverProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  label?: string;
  placeholder?: string;
}

export const MultiSelectPopover: React.FC<MultiSelectPopoverProps> = ({
  options,
  selected,
  onChange,
  label,
  placeholder = "Select...",
}) => {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((o) => o !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div>
      {label && <div className="mb-1 text-xs font-medium">{label}</div>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between bg-background text-foreground border border-input rounded-md px-3 py-1 shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            aria-label={placeholder}
          >
            <span className="truncate">
              {selected.length > 0
                ? selected.join(", ")
                : <span className="text-muted-foreground">{placeholder}</span>}
            </span>
            <Check className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 max-h-60 overflow-y-auto p-0 bg-background border border-input" align="start">
          <div className="flex flex-col gap-1 p-2">
            {options.map((option) => (
              <label
                key={option}
                className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-accent"
              >
                <Checkbox
                  checked={selected.includes(option)}
                  onCheckedChange={() => handleSelect(option)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{option}</span>
              </label>
            ))}
            {options.length === 0 && (
              <span className="text-xs text-muted-foreground">No options available</span>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
