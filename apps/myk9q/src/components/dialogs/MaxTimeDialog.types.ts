export interface MaxTimeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  showWarning?: boolean;
  classData: MaxTimeClassData;
  onTimeUpdate?: () => void;
}

export interface MaxTimeClassData {
  id: string;
  element: string;
  level: string;
  class_name: string;
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;
  area_count?: number;
  pairedClassId?: string;
}

export interface TimeRange {
  min: number;
  max: number;
  areas: number;
}

export interface ClassRequirements {
  has_30_second_warning?: boolean;
  time_type?: 'fixed' | 'range' | 'dictated';
  warning_notes?: string;
}
