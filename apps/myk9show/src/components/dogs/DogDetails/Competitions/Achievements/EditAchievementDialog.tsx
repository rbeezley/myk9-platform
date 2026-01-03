import React, { useState, useEffect } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
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

  useEffect(() => {
    if (achievement) {
      const { ...achievementData } = achievement;
      setForm(achievementData);
    }
  }, [achievement]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    if (!form.title || !form.date || !form.description || !achievement?.id) return;
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
        <div>
          <label htmlFor="title" className="block font-medium text-sm mb-1">Title<span className="text-red-500">*</span></label>
          <Input
            id="title"
            name="title"
            value={""}
            onChange={handleChange}
            placeholder="Enter title"
            required
          />
        </div>
        <div>
          <DatePickerField
            label="Date"
            value={""}
            onChange={(value) => setForm(prev => ({ ...prev, date: value }))}
            required
            name="date"
            id="date"
          />
        </div>
        <div>
          <label htmlFor="description" className="block font-medium text-sm mb-1">Description<span className="text-red-500">*</span></label>
          <Textarea
            id="description"
            name="description"
            value={""}
            onChange={handleChange}
            placeholder="Enter description"
            rows={3}
            required
          />
        </div>
        <div>
          <label htmlFor="icon" className="block font-medium text-sm mb-1">Icon</label>
          <Input
            id="icon"
            name="icon"
            value={""}
            onChange={handleChange}
            placeholder="Enter emoji icon"
          />
        </div>
        <div>
          <label htmlFor="color" className="block font-medium text-sm mb-1">Color</label>
          <Input
            type="color"
            id="color"
            name="color"
            value={""}
            onChange={handleChange}
            className="w-16 h-10 p-1"
          />
        </div>
      </div>
    </StandardDialog>
  );
};

export default EditAchievementDialog;
