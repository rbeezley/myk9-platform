/* scentwork-data.js — Scent Work-specific mock data */
/* Structure:
   Show → Days → Trials (1-2 per day) → Classes (element+level+section) → Entries → Result
*/

const SW_ELEMENTS = [
  { key: 'container', label: 'Container', icon: 'box', palette: 'amber' },
  { key: 'interior',  label: 'Interior',  icon: 'home', palette: 'teal' },
  { key: 'exterior',  label: 'Exterior',  icon: 'trees', palette: 'green' },
  { key: 'buried',    label: 'Buried',    icon: 'shovel', palette: 'terracotta' },
];

const SW_LEVELS = ['Novice', 'Advanced', 'Excellent', 'Master', 'Detective', 'Handler Disc.'];

// 8 dogs entered in the show — each in multiple classes
const SW_DOGS = [
  { id: 'd1', name: 'Maggie', regName: 'Sunridge Magnolia Of Birchbrook', breed: 'Golden Retriever', owner: 'Sarah Martin', armband: 201, palette: 'amber' },
  { id: 'd2', name: 'Atlas',  regName: 'Everest North Star', breed: 'Bernese Mtn Dog', owner: 'Paul Greene', armband: 156, palette: 'blue' },
  { id: 'd3', name: 'Daisy',  regName: 'Willowbrook Fields Of Gold', breed: 'Poodle (Std)', owner: 'Sarah Martin', armband: 203, palette: 'teal' },
  { id: 'd4', name: 'Beau',   regName: 'Ironwood Beauregard', breed: 'Border Collie', owner: 'Linda Park', armband: 174, palette: 'purple' },
  { id: 'd5', name: 'Juno',   regName: 'Midnight Lily Juno', breed: 'Aussie', owner: 'Tom Hale', armband: 189, palette: 'pink' },
  { id: 'd6', name: 'Rex',    regName: 'Kingston Red Rex', breed: 'Vizsla', owner: 'Maria Costa', armband: 192, palette: 'terracotta' },
  { id: 'd7', name: 'Penny',  regName: 'Copperfield Penny Lane', breed: 'Cocker Spaniel', owner: 'James Wu', armband: 168, palette: 'green' },
  { id: 'd8', name: 'Kai',    regName: 'Summit Blue Kai', breed: 'Siberian Husky', owner: 'Ellen Vaz', armband: 211, palette: 'blue' },
];

// The secretary's "current" show — Scent Work weekend
const SW_SHOW = {
  id: 's2',
  name: 'Lehigh Valley Scent Work',
  club: 'Lehigh Valley KC',
  city: 'Allentown, PA',
  venue: 'AG Hall',
  dateRange: 'Apr 26–27 · Sat–Sun',
  month: 'Apr', day: '26',
  palette: 'teal',
  days: [
    {
      id: 'day1', label: 'Saturday · Apr 26', date: 'Apr 26',
      trials: [
        { id: 't1a', label: 'Trial 1 · AM', time: '8:00 AM – 12:00 PM', judge: 'Janet Whitaker' },
        { id: 't1b', label: 'Trial 2 · PM', time: '1:30 PM – 5:30 PM',  judge: 'Peter Coleman' },
      ],
    },
    {
      id: 'day2', label: 'Sunday · Apr 27', date: 'Apr 27',
      trials: [
        { id: 't2a', label: 'Trial 3 · AM', time: '8:00 AM – 12:00 PM', judge: 'Peter Coleman' },
        { id: 't2b', label: 'Trial 4 · PM', time: '1:30 PM – 5:30 PM',  judge: 'Janet Whitaker' },
      ],
    },
  ],
};

// Classes — subset, focused on Trial 1 Saturday AM so the run-sheet has teeth
const SW_CLASSES = [
  // --- Trial 1 AM (Saturday) ---
  { id: 'c_t1a_cn', trialId: 't1a', element: 'container', level: 'Novice', section: 'A',
    ring: 'Ring 3', startTime: '9:40 AM', judge: 'Janet Whitaker',
    timeLimit: '2:00', status: 'upcoming', entries: 8 },
  { id: 'c_t1a_in', trialId: 't1a', element: 'interior',  level: 'Novice', section: 'A',
    ring: 'Ring 1', startTime: '11:20 AM', judge: 'Janet Whitaker',
    timeLimit: '2:00', status: 'upcoming', entries: 7 },
  { id: 'c_t1a_ex', trialId: 't1a', element: 'exterior',  level: 'Novice', section: 'A',
    ring: 'Ring 2', startTime: '10:15 AM', judge: 'Janet Whitaker',
    timeLimit: '2:00', status: 'upcoming', entries: 6 },
  { id: 'c_t1a_bu', trialId: 't1a', element: 'buried',    level: 'Novice', section: 'A',
    ring: 'Ring 4', startTime: '2:30 PM', judge: 'Janet Whitaker',
    timeLimit: '2:00', status: 'upcoming', entries: 5 },
  { id: 'c_t1a_cA', trialId: 't1a', element: 'container', level: 'Advanced', section: 'A',
    ring: 'Ring 3', startTime: '10:30 AM', judge: 'Janet Whitaker',
    timeLimit: '2:30', status: 'upcoming', entries: 6 },
  { id: 'c_t1a_iA', trialId: 't1a', element: 'interior', level: 'Advanced', section: 'A',
    ring: 'Ring 1', startTime: '12:10 PM', judge: 'Janet Whitaker',
    timeLimit: '2:30', status: 'upcoming', entries: 5 },

  // --- Trial 2 PM (Saturday) ---
  { id: 'c_t1b_cn', trialId: 't1b', element: 'container', level: 'Novice', section: 'B',
    ring: 'Ring 3', startTime: '2:00 PM', judge: 'Peter Coleman',
    timeLimit: '2:00', status: 'upcoming', entries: 8 },
  { id: 'c_t1b_in', trialId: 't1b', element: 'interior',  level: 'Novice', section: 'B',
    ring: 'Ring 1', startTime: '3:15 PM', judge: 'Peter Coleman',
    timeLimit: '2:00', status: 'upcoming', entries: 7 },
];

// Entries — which dogs are in which classes (many-to-many)
// status: 'pending' | 'checked-in' | 'scratched' | 'absent' | 'finished'
const SW_ENTRIES = [
  // Maggie — Container Novice (running now)
  { id: 'e1',  classId: 'c_t1a_cn', dogId: 'd1', runOrder: 1, status: 'finished',    result: { qualified: true,  time: '00:42.8', faults: 0, placement: 2, notes: '' } },
  { id: 'e2',  classId: 'c_t1a_cn', dogId: 'd2', runOrder: 2, status: 'checked-in',  result: null },
  { id: 'e3',  classId: 'c_t1a_cn', dogId: 'd3', runOrder: 3, status: 'checked-in',  result: null },
  { id: 'e4',  classId: 'c_t1a_cn', dogId: 'd4', runOrder: 4, status: 'pending',     result: null },
  { id: 'e5',  classId: 'c_t1a_cn', dogId: 'd5', runOrder: 5, status: 'pending',     result: null },
  { id: 'e6',  classId: 'c_t1a_cn', dogId: 'd6', runOrder: 6, status: 'pending',     result: null },
  { id: 'e7',  classId: 'c_t1a_cn', dogId: 'd7', runOrder: 7, status: 'scratched',   result: null },
  { id: 'e8',  classId: 'c_t1a_cn', dogId: 'd8', runOrder: 8, status: 'pending',     result: null },

  // Maggie in many other classes this weekend (for exhibitor view)
  { id: 'e9',  classId: 'c_t1a_in', dogId: 'd1', runOrder: 2, status: 'pending', result: null },
  { id: 'e10', classId: 'c_t1a_ex', dogId: 'd1', runOrder: 1, status: 'pending', result: null },
  { id: 'e11', classId: 'c_t1a_bu', dogId: 'd1', runOrder: 3, status: 'pending', result: null },

  // Daisy in multiple too
  { id: 'e12', classId: 'c_t1a_in', dogId: 'd3', runOrder: 4, status: 'pending', result: null },
  { id: 'e13', classId: 'c_t1a_ex', dogId: 'd3', runOrder: 5, status: 'pending', result: null },
  { id: 'e14', classId: 'c_t1a_bu', dogId: 'd3', runOrder: 2, status: 'pending', result: null },

  // Other dogs in Interior Novice for variety
  { id: 'e15', classId: 'c_t1a_in', dogId: 'd4', runOrder: 1, status: 'pending', result: null },
  { id: 'e16', classId: 'c_t1a_in', dogId: 'd5', runOrder: 3, status: 'pending', result: null },
  { id: 'e17', classId: 'c_t1a_in', dogId: 'd6', runOrder: 5, status: 'pending', result: null },
  { id: 'e18', classId: 'c_t1a_in', dogId: 'd7', runOrder: 6, status: 'pending', result: null },
  { id: 'e19', classId: 'c_t1a_in', dogId: 'd8', runOrder: 7, status: 'pending', result: null },
];

// Helpers
function swGetClass(id) { return SW_CLASSES.find(c => c.id === id); }
function swGetDog(id) { return SW_DOGS.find(d => d.id === id); }
function swGetTrial(id) { for (const day of SW_SHOW.days) { const t = day.trials.find(tt => tt.id === id); if (t) return { trial: t, day }; } return null; }
function swGetEntriesForClass(classId) { return SW_ENTRIES.filter(e => e.classId === classId).sort((a,b) => a.runOrder - b.runOrder); }
function swGetEntriesForDog(dogId) { return SW_ENTRIES.filter(e => e.dogId === dogId); }
function swGetElement(key) { return SW_ELEMENTS.find(e => e.key === key); }

Object.assign(window, {
  SW_SHOW, SW_ELEMENTS, SW_LEVELS, SW_DOGS, SW_CLASSES, SW_ENTRIES,
  swGetClass, swGetDog, swGetTrial, swGetEntriesForClass, swGetEntriesForDog, swGetElement,
});
