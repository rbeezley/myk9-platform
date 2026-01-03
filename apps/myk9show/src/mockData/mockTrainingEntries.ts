import type { TrainingEntry } from '@/components/dogs/DogDetails/TrainingJournal/AddTrainingEntryDialog';

// --- MOCK TRAINING JOURNAL ENTRIES ---
export const MOCK_TRAINING_ENTRIES: TrainingEntry[] = [
  {
    id: 1,
    title: 'Basic Obedience - Sit/Stay',
    notes: 'Practiced sit and stay commands in the backyard. Good progress, but still distracted by birds.',
    date: '2025-04-10',
    tags: ['Obedience', 'Sit', 'Stay'],
  },
  {
    id: 2,
    title: 'Recall Training',
    notes: 'Worked on recall at the park with a long lead. Responded well with treats as reward.',
    date: '2025-04-15',
    tags: ['Recall', 'Park'],
  },
  {
    id: 3,
    title: 'Agility Tunnel Introduction',
    notes: 'First exposure to agility tunnel. Needed encouragement but went through twice by the end.',
    date: '2025-04-20',
    tags: ['Agility', 'Tunnel', 'New Skill'],
  },
  {
    id: 4,
    title: 'Heel Work',
    notes: 'Practiced heeling on leash around the neighborhood. Pulled a bit when passing other dogs.',
    date: '2025-04-25',
    tags: ['Heel', 'Leash'],
  },
];
