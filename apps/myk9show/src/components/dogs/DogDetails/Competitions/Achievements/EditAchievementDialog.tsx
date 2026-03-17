import React from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Textarea } from '@/components/ui/textarea';
import { useFormValidation } from '@/hooks/useFormValidation';
import { z } from 'zod';
import type { Achievement } from '@/types/achievement-types';

const achievementSchema = z.object({
  title: z.string().min(1, 'Please enter a title'),
  date: z.string().min(1, 'Please select a date'),
  description: z.string().min(1, 'Please enter a description'),
  icon: z.string().optional().default('🏆'),
  color: z.string().optional().default('#3b82f6'),
});

type AchievementFormData = z.infer<typeof achievementSchema>;

interface EditAchievementDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (id: string, achievement: Omit<Achievement, 'id'>) => void;
  achievement: Achievement | null;
}

const defaultData: AchievementFormData = {
  title: '',
  date: '',
  description: '',
  icon: '🏆',
  color: '#3b82f6',
};

const EditAchievementDialog: React.FC<EditAchievementDialogProps> = ({
  open,
  achievement,
  onClose,
  onSave,
}) => {
  const form = useFormValidation(achievementSchema, defaultData);

  // Sync form state with achievement prop - using render-time state update pattern
  const achievementId = achievement?.id || '';
  const [lastAchievementId, setLastAchievementId] = React.useState(achievementId);
  if (achievementId !== lastAchievementId && achievement) {
    setLastAchievementId(achievementId);
    form.reset({
      title: achievement.title,
      date: achievement.date,
      description: achievement.description,
      icon: achievement.icon ?? '🏆',
      color: achievement.color ?? '#3b82f6',
    });
  }

  const handleSave = form.handleSubmit(data => {
    if (!achievement?.id) return;
    onSave(achievement.id, data);
  });

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      title="Edit Achievement"
      description="Update the achievement details"
      onSave={handleSave}
    >
      <div className="space-y-4">
        <FormField label="Title" fieldId="title" required error={form.getError('title')}>
          <Input
            id="title"
            name="title"
            value={form.data.title}
            onChange={e => form.setValue('title', e.target.value)}
            onBlur={() => form.touchField('title')}
            placeholder="Enter title"
            {...form.getFieldProps('title')}
          />
        </FormField>
        <FormField label="Date" fieldId="date" required error={form.getError('date')}>
          <DatePickerField
            value={form.data.date}
            onChange={value => form.setValue('date', value)}
            required
            name="date"
            id="date"
          />
        </FormField>
        <FormField
          label="Description"
          fieldId="description"
          required
          error={form.getError('description')}
        >
          <Textarea
            id="description"
            name="description"
            value={form.data.description}
            onChange={e => form.setValue('description', e.target.value)}
            onBlur={() => form.touchField('description')}
            placeholder="Enter description"
            rows={3}
            {...form.getFieldProps('description')}
          />
        </FormField>
        <FormField label="Icon" fieldId="icon">
          <Input
            id="icon"
            name="icon"
            value={form.data.icon ?? '🏆'}
            onChange={e => form.setValue('icon', e.target.value)}
            placeholder="Enter emoji icon"
          />
        </FormField>
        <FormField label="Color" fieldId="color">
          <Input
            type="color"
            id="color"
            name="color"
            value={form.data.color ?? '#3b82f6'}
            onChange={e => form.setValue('color', e.target.value)}
            className="w-16 h-10 p-1"
          />
        </FormField>
      </div>
    </StandardDialog>
  );
};

export default EditAchievementDialog;
