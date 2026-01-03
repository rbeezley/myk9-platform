import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { Input } from '@/components/ui/input';
import DatePickerField from '@/components/common/DatePickerField';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import type { Achievement } from '@/types/achievement-types';

interface AddAchievementDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (achievement: Omit<Achievement, 'id'>) => void;
  initialData?: Omit<Achievement, 'id'>;
}

const AddAchievementDialog: React.FC<AddAchievementDialogProps> = ({ open, onClose, onAdd, initialData }) => {
  const [form, setForm] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    date: initialData?.date || '',
    icon: initialData?.icon || '🏆',
    color: initialData?.color || '#3b82f6',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleDateChange = (date: string) => {
    setForm(prev => ({
      ...prev,
      date
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.date || !form.description) return;
    
    onAdd({
      ...form,
      date: form.date || new Date().toISOString().split('T')[0],
    });
    
    // Reset form
    setForm({
      title: '',
      description: '',
      date: '',
      icon: '🏆',
      color: '#3b82f6',
    });
    
    onClose();
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() => document.getElementById('add-achievement-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}
      title="Add Achievement"
      description="Add a new achievement"
      formId="add-achievement-form"
      saveLabel={<><Plus className="mr-2 h-4 w-4" /> Add</>}
    >
      <form id="add-achievement-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block font-medium text-sm mb-1">Title<span className="text-red-500">*</span></label>
          <Input
            id="title"
            name="title"
            className="bg-input"
            value={""}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label htmlFor="date" className="block font-medium text-sm mb-1">Date<span className="text-red-500">*</span></label>
          <DatePickerField
            value={""}
            onChange={handleDateChange}
            required
            name="date"
            id="date"
            label="Date"
          />
        </div>
        <div>
          <label htmlFor="description" className="block font-medium text-sm mb-1">Description<span className="text-red-500">*</span></label>
          <Textarea
            id="description"
            name="description"
            className="bg-input"
            value={""}
            onChange={handleChange}
            required
          />
        </div>
        <div className="flex gap-4 items-center">
          <div>
            <label htmlFor="icon" className="block text-sm font-medium mb-1">Icon</label>
            <select 
              id="icon" 
              name="icon"
              className="border rounded px-2 py-1 bg-input"
              value={""}
              onChange={handleChange}
            >
              <option value="🏆">🏆 Trophy</option>
              <option value="🥇">🥇 Medal</option>
              <option value="🌟">🌟 Star</option>
              <option value="🎖️">🎖️ Ribbon</option>
              <option value="🐾">🐾 Paw</option>
            </select>
          </div>
          <div>
            <label htmlFor="color" className="block text-sm font-medium mb-1">Color</label>
            <select 
              id="color" 
              name="color"
              className="border rounded px-2 py-1 bg-input"
              value={""}
              onChange={handleChange}
            >
              <option value="bg-yellow-50">Yellow</option>
              <option value="bg-blue-50">Blue</option>
              <option value="bg-purple-50">Purple</option>
              <option value="bg-green-50">Green</option>
              <option value="bg-gray-50">Gray</option>
            </select>
          </div>
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddAchievementDialog;
