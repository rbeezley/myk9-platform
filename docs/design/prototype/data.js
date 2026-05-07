/* data.js — mock dataset for myK9Show redesign */

const SHOWS = [
  { id: 's1', name: 'Bergen County Kennel Club', club: 'Bergen County KC', city: 'Ramsey, NJ', venue: 'Eisenhower Park', month: 'Apr', day: '26', dateISO: '2026-04-26', dateRange: 'Apr 26 · Sat', kind: 'All-breed conformation', palette: 'terracotta', badge: 'Closes Fri', status: 'closes-soon', statusText: 'Entries close Friday, Apr 25', entries: 412, entriesOpen: true, fee: 32, trials: 2, classes: 18, judges: 6 },
  { id: 's2', name: 'Lehigh Valley Spring Classic', club: 'Lehigh Valley KC', city: 'Allentown, PA', venue: 'AG Hall', month: 'Apr', day: '26', dateISO: '2026-04-26', dateRange: 'Apr 26–28 · Sat–Mon', kind: 'All-breed · Obedience · Rally', palette: 'teal', badge: 'Premium live', status: 'open', statusText: 'Open — premium list published', entries: 486, entriesOpen: true, fee: 30, trials: 3, classes: 24, judges: 9 },
  { id: 's3', name: 'Hudson Valley Obedience Trial', club: 'Hudson Valley OTC', city: 'Poughkeepsie, NY', venue: 'Civic Center', month: 'May', day: '03', dateISO: '2026-05-03', dateRange: 'May 3 · Sun', kind: 'Obedience · Rally', palette: 'purple', badge: 'Early bird', status: 'open', statusText: 'Early-bird pricing until Apr 20', entries: 98, entriesOpen: true, fee: 28, trials: 1, classes: 12, judges: 2 },
  { id: 's4', name: 'Greater Philadelphia Fanciers', club: 'Greater Philly DF', city: 'Oaks, PA', venue: 'Expo Center', month: 'May', day: '10', dateISO: '2026-05-10', dateRange: 'May 10–11 · Sat–Sun', kind: 'All-breed conformation', palette: 'blue', badge: 'All-breed', status: 'open', statusText: 'Open for entries', entries: 1204, entriesOpen: true, fee: 35, trials: 2, classes: 30, judges: 12 },
  { id: 's5', name: 'Golden Retriever Club · Specialty', club: 'Golden Retriever Club of Central NJ', city: 'Flemington, NJ', venue: 'County Fairgrounds', month: 'May', day: '17', dateISO: '2026-05-17', dateRange: 'May 17 · Sun', kind: 'Specialty · Sweepstakes', palette: 'pink', badge: 'Specialty', status: 'open', statusText: 'Sweepstakes judge confirmed', entries: 142, entriesOpen: true, fee: 40, trials: 2, classes: 14, judges: 3 },
  { id: 's6', name: 'Cross-Creek Scent Work Trial', club: 'Cross-Creek Hounds', city: 'Milford, NJ', venue: 'Training Barn', month: 'May', day: '24', dateISO: '2026-05-24', dateRange: 'May 24 · Sun', kind: 'Scent work · Novice–Elite', palette: 'green', badge: 'Scent work', status: 'open', statusText: 'Wait-list for Elite', entries: 64, entriesOpen: true, fee: 25, trials: 1, classes: 8, judges: 2 },
];

const TRIALS = [
  { id: 't1', showId: 's2', name: 'Lehigh Valley — Saturday All-Breed', date: 'Apr 26 · Sat', rings: 4, classes: 12, entries: 210, status: 'Accepting', palette: 'teal', judges: ['Janet Whitaker', 'Peter Coleman'] },
  { id: 't2', showId: 's2', name: 'Lehigh Valley — Sunday All-Breed', date: 'Apr 27 · Sun', rings: 4, classes: 10, entries: 188, status: 'Accepting', palette: 'teal', judges: ['Marcia Grant', 'Wanda Reese'] },
  { id: 't3', showId: 's2', name: 'Lehigh Valley — Obedience', date: 'Apr 28 · Mon', rings: 2, classes: 8, entries: 88, status: 'Accepting', palette: 'purple', judges: ['Don Keller'] },
  { id: 't4', showId: 's1', name: 'Bergen Co — Saturday', date: 'Apr 26 · Sat', rings: 3, classes: 10, entries: 212, status: 'Closing Fri', palette: 'terracotta', judges: ['Elaine Bosworth'] },
];

const CLASSES = [
  { id: 'c1', trialId: 't1', name: 'Golden Retriever — Open Bitch', ring: 'Ring 3', time: '9:40 AM', judge: 'Janet Whitaker', entries: 8, status: 'Accepting', palette: 'teal' },
  { id: 'c2', trialId: 't1', name: 'Labrador — Best of Breed', ring: 'Ring 3', time: '10:20 AM', judge: 'Janet Whitaker', entries: 12, status: 'Accepting', palette: 'amber' },
  { id: 'c3', trialId: 't1', name: 'Poodle Std — Open Dog', ring: 'Ring 1', time: '11:00 AM', judge: 'Peter Coleman', entries: 6, status: 'Accepting', palette: 'blue' },
  { id: 'c4', trialId: 't3', name: 'Novice B — Obedience', ring: 'Ring 2', time: '9:00 AM', judge: 'Don Keller', entries: 14, status: 'Waitlist', palette: 'purple' },
  { id: 'c5', trialId: 't2', name: 'Bulldog — Open', ring: 'Ring 4', time: '10:30 AM', judge: 'Wanda Reese', entries: 5, status: 'Accepting', palette: 'pink' },
  { id: 'c6', trialId: 't4', name: 'Samoyed — Best of Breed', ring: 'Ring 2', time: '9:15 AM', judge: 'Elaine Bosworth', entries: 4, status: 'Closing Fri', palette: 'terracotta' },
];

const DOGS = [
  { id: 'd1', callName: 'Maggie', regName: 'Sunridge Magnolia Of Birchbrook', breed: 'Golden Retriever', sex: 'B', age: '3 yr', owner: 'Sarah Martin', handler: 'Sarah Martin', titles: 'CH · CGC', points: 11, ribbons: 24, career: { shows: 18, bob: 3, bos: 2 }, palette: 'amber', status: 'Entered this weekend' },
  { id: 'd2', callName: 'Finn', regName: 'Blackwater Northern Light', breed: 'Labrador Retriever', sex: 'D', age: '5 yr', owner: 'Sarah Martin', handler: 'Mark Greene', titles: 'GCH · CD', points: 18, ribbons: 41, career: { shows: 34, bob: 8, bos: 5 }, palette: 'blue', status: 'Resting' },
  { id: 'd3', callName: 'Daisy', regName: 'Willowbrook Fields Of Gold', breed: 'Poodle (Std)', sex: 'B', age: '2 yr', owner: 'Sarah Martin', handler: 'Sarah Martin', titles: 'Pointed', points: 6, ribbons: 9, career: { shows: 8, bob: 0, bos: 1 }, palette: 'teal', status: 'Entered this weekend' },
  { id: 'd4', callName: 'Rosie', regName: 'Claremont Wild Rose', breed: 'Bulldog', sex: 'B', age: '4 yr', owner: 'Sarah Martin', handler: 'Sarah Martin', titles: 'CH', points: 15, ribbons: 19, career: { shows: 16, bob: 4, bos: 2 }, palette: 'pink', status: 'Resting' },
];

const CLUBS = [
  { id: 'cl1', name: 'Bergen County Kennel Club', city: 'Ramsey, NJ', members: 184, shows: 6, founded: 1952, palette: 'terracotta', tagline: 'All-breed · since 1952', next: 'Apr 26 · Eisenhower Park' },
  { id: 'cl2', name: 'Lehigh Valley Kennel Club', city: 'Allentown, PA', members: 252, shows: 9, founded: 1948, palette: 'teal', tagline: 'All-breed · obedience · rally', next: 'Apr 26 · AG Hall' },
  { id: 'cl3', name: 'Hudson Valley Obedience Training Club', city: 'Poughkeepsie, NY', members: 96, shows: 4, founded: 1971, palette: 'purple', tagline: 'Obedience & rally specialist', next: 'May 3 · Civic Center' },
  { id: 'cl4', name: 'Golden Retriever Club of Central NJ', city: 'Flemington, NJ', members: 118, shows: 3, founded: 1966, palette: 'pink', tagline: 'Parent club · specialty', next: 'May 17 · Fairgrounds' },
  { id: 'cl5', name: 'Greater Philadelphia Dog Fanciers', city: 'Oaks, PA', members: 310, shows: 12, founded: 1939, palette: 'blue', tagline: 'All-breed · the big one', next: 'May 10 · Expo Center' },
  { id: 'cl6', name: 'Cross-Creek Hound Club', city: 'Milford, NJ', members: 74, shows: 4, founded: 1989, palette: 'green', tagline: 'Scent work · tracking', next: 'May 24 · Training Barn' },
];

const PEOPLE = [
  { id: 'p1', name: 'Janet Whitaker', role: 'Judge', city: 'Bethesda, MD', approved: ['Sporting', 'Hound'], yearsJudging: 18, palette: 'teal', next: 'Judging Apr 26' },
  { id: 'p2', name: 'Peter Coleman', role: 'Judge', city: 'Albany, NY', approved: ['Working', 'Herding'], yearsJudging: 22, palette: 'blue', next: 'Judging Apr 26' },
  { id: 'p3', name: 'Mark Greene', role: 'Handler', city: 'Yonkers, NY', dogs: 14, wins: 42, palette: 'terracotta', next: 'Lehigh Valley Sat' },
  { id: 'p4', name: 'Wanda Reese', role: 'Judge', city: 'Scranton, PA', approved: ['Non-sporting', 'Toy'], yearsJudging: 11, palette: 'pink', next: 'Judging Apr 27' },
  { id: 'p5', name: 'Don Keller', role: 'Judge · Obedience', city: 'Newark, NJ', approved: ['All-levels obedience'], yearsJudging: 14, palette: 'purple', next: 'Judging Apr 28' },
  { id: 'p6', name: 'Elaine Bosworth', role: 'Judge', city: 'Ramsey, NJ', approved: ['Terrier', 'Sporting'], yearsJudging: 9, palette: 'amber', next: 'Judging Apr 26' },
];

Object.assign(window, { SHOWS, TRIALS, CLASSES, DOGS, CLUBS, PEOPLE });
