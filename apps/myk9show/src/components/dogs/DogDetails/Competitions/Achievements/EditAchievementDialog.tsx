import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Textarea } from '@/components/ui/textarea';
import type { Achievement } from '@/types/achievement-types';

interface EditAchievementDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (id: string, achievement: Omit<Achievement, 'id'>) => void;
  achievement: Achievement | null;
}

const EditAchievementDialog: React.FC<EditAchievementDialogProps> = ({ open, achievement, onClose, onSave }) => {
  const [form, setForm] = useState<Omit<Achievement, 'id'>>({
    title: '',
    date: '',
    description: '',
    icon: '🏆',
    color: '#3b82f6',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync form state with achievement prop - using render-time state update pattern
  const achievementId = achievement?.id || '';
  const [lastAchievementId, setLastAchievementId] = useState(achievementId);
  if (achievementId !== lastAchievementId && achievement) {
    setLastAchievementId(achievementId);
    const { ...achievementData } = achievement;
    setForm(achievementData);
    setErrors({});
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.title) newErrors.title = 'Please enter a title';
    if (!form.date) newErrors.date = 'Please select a date';
    if (!form.description) newErrors.description = 'Please enter a description';
    return newErrors;
  };

  const handleSubmit = (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    if (!achievement?.id) return;
    onSave(achievement.id, form);
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      title="Edit Achievement"
      description="Update the achievement details"
      onSave={handleSubmit}
    >
      <div className="space-y-4">
        <FormField label="Title" fieldId="title" required error={errors.title}>
          <Input
            id="title"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Enter title"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'title-error' : undefined}
          />
        </FormField>
        <FormField label="Date" fieldId="date" required error={errors.date}>
          <DatePickerField
            value={form.date}
            onChange={(value) => setForm(prev => ({ ...prev, date: value }))}
            required
            name="date"
            id="date"
          />
        </FormField>
        <FormField label="Description" fieldId="description" required error={errors.description}>
          <Textarea
            id="description"
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Enter description"
            rows={3}
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? 'description-error' : undefined}
          />
        </FormField>
        <FormField label="Icon" fieldId="icon">
          <Input
            id="icon"
            name="icon"
            value={form.icon}
            onChange={handleChange}
            placeholder="Enter emoji icon"
          />
        </FormField>
        <FormField label="Color" fieldId="color">
          <Input
            type="color"
            id="color"
            name="color"
            value={form.color}
            onChange={handleChange}
            className="w-16 h-10 p-1"
          />
        </FormField>
      </div>
    </StandardDialog>
  );
};

export default EditAchievementDialog;
