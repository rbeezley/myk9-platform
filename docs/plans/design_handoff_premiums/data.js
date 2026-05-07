// Shared premium content. Two datasets:
// - SKINNY: matches the existing 3 styles (Test Club 1, $10/$20)
// - RICH: realistic Scent Work premium for the 5 new styles, modeled on a real AKC premium

window.PREMIUM_SKINNY = {
  club: "Test Club 1",
  showName: "Test Club 1 Show",
  showType: "AKC Conformation",
  city: "Anywhere",
  state: "TX",
  venue: "Test Venue, 123 Test Street",
  dateRange: "June 14 – 15, 2026",
  days: ["Saturday, June 14, 2026", "Sunday, June 15, 2026"],
  closingDate: "June 7, 2026",
  closingTime: "12:00 PM CT",
  entryFee: "$10.00",
  additionalEntryFee: "$20.00",
  totalEntries: 1,
  judges: [
    { name: "Robin Stansell", panel: "All Breeds" }
  ],
  events: [
    { day: "Saturday", time: "8:00 AM", name: "Conformation – All Breeds" },
    { day: "Sunday", time: "8:00 AM", name: "Conformation – All Breeds" }
  ],
  showSecretary: { name: "Jane Doe", email: "secretary@testclub1.org", phone: "(555) 123-4567" },
  trialChair: { name: "John Smith", email: "chair@testclub1.org", phone: "(555) 234-5678" }
};

window.PREMIUM_RICH = {
  club: "Bexar County Kennel Club",
  clubAbbrev: "BCKC",
  established: 1947,
  showName: "Spring Scent Work Trial",
  showType: "AKC Licensed Scent Work Trial",
  tagline: "Three days. Six trials. One unforgettable nose.",
  city: "San Antonio",
  state: "TX",
  venue: "Live Oak Civic Center",
  venueAddress: "8101 Pat Booker Rd, Live Oak, TX 78233",
  venueNotes: "Indoor air-conditioned facility · Crating in adjacent hall · Ample on-site parking",
  dateRange: "June 12 – 14, 2026",
  days: [
    { date: "Friday, June 12, 2026", trial: "Trial 1 & 2" },
    { date: "Saturday, June 13, 2026", trial: "Trial 3 & 4" },
    { date: "Sunday, June 14, 2026", trial: "Trial 5 & 6" }
  ],
  openingDate: "April 15, 2026",
  closingDate: "June 3, 2026",
  closingTime: "8:00 PM CT",
  drawDate: "June 4, 2026",
  confirmationDate: "June 6, 2026",

  entryLimits: {
    perTrial: 60,
    perDay: 120,
    total: 360,
    note: "First-received basis. Limit is firm; over-entries refunded."
  },

  fees: {
    firstEntry: 25,
    additional: 22,
    junior: 18,
    novicePackage: 95,
    lateFee: 10,
    refundPolicy: "Refunds (less $5 processing) issued for written withdrawals received before closing."
  },

  judges: [
    { name: "Cynthia Beagles", city: "Austin, TX", trials: "Trials 1, 3, 5", element: "Containers, Interiors, Buried" },
    { name: "Marcus Whitfield", city: "Boulder, CO", trials: "Trials 2, 4, 6", element: "Exteriors, Vehicles, Handler Discrimination" }
  ],

  classes: [
    { level: "Novice", elements: ["Containers", "Interiors", "Exteriors", "Buried"], duration: "2 min", hides: "1 per element" },
    { level: "Advanced", elements: ["Containers", "Interiors", "Exteriors", "Buried"], duration: "2 min", hides: "1–2 per element" },
    { level: "Excellent", elements: ["Containers", "Interiors", "Exteriors", "Buried"], duration: "2:30", hides: "2–3 per element" },
    { level: "Master", elements: ["All four + Handler Disc.", "Detective"], duration: "3 min", hides: "3–5 per element" }
  ],

  schedule: [
    { time: "7:00 AM", item: "Doors open · Check-in begins" },
    { time: "7:45 AM", item: "Briefing — Trial 1 (Containers, Interiors)" },
    { time: "8:30 AM", item: "Trial 1 begins · Novice → Master" },
    { time: "12:00 PM", item: "Lunch break · 45 minutes" },
    { time: "12:45 PM", item: "Briefing — Trial 2 (Exteriors, Buried)" },
    { time: "1:30 PM", item: "Trial 2 begins" },
    { time: "5:30 PM", item: "Approximate finish · Ribbons & Q-cards" }
  ],

  officers: [
    { role: "President", name: "Eleanor Park" },
    { role: "Vice President", name: "Daniel Ortega" },
    { role: "Treasurer", name: "Marcia Liu" },
    { role: "Secretary", name: "Robert Chen" },
    { role: "AKC Delegate", name: "Eleanor Park" }
  ],

  trialCommittee: [
    { role: "Trial Chair", name: "Sarah Whitman", contact: "trial@bckc.org" },
    { role: "Trial Secretary", name: "James Nakamura", contact: "secretary@bckc.org · (210) 555-0142" },
    { role: "Hospitality", name: "Rita Alvarez" },
    { role: "Volunteer Coordinator", name: "Kevin O'Brien" },
    { role: "Chief Steward", name: "Patricia Yamamoto" }
  ],

  awards: [
    "First through Fourth in each class (rosettes)",
    "Qualifying ribbons for all qualifying scores",
    "High in Trial — engraved bowl, each trial",
    "High Combined Master — silver platter",
    "New Title certificates presented at end of trial"
  ],

  notices: [
    "All dogs must be measured on first day for class eligibility.",
    "Bitches in season are welcome; please notify the secretary at check-in.",
    "Vaccination records may be requested by AKC reps.",
    "No dogs in heat may compete in shared search areas without prior accommodation.",
    "AKC rules and regulations govern this trial."
  ],

  hotels: [
    { name: "Hampton Inn Live Oak", distance: "0.4 mi", rate: "$129", code: "BCKC26" },
    { name: "Holiday Inn Express Selma", distance: "1.2 mi", rate: "$119", code: "BCKC" },
    { name: "La Quinta Windcrest", distance: "2.1 mi", rate: "$109", code: "—" }
  ],

  sponsors: [
    "Lone Star Pet Supply",
    "K9 Nose Work® Texas",
    "Alamo Veterinary Hospital",
    "Hill Country Dog Bakery"
  ],

  entryMethods: [
    { method: "Online", detail: "myk9show.com/bckc-spring-2026" },
    { method: "Mail", detail: "BCKC Trial Secretary · PO Box 4421 · San Antonio, TX 78212" },
    { method: "Email", detail: "secretary@bckc.org (PDF entries with payment confirmation)" }
  ],

  // Supplemental fields (from club template)
  vetClinic: {
    name: "Alamo Veterinary Hospital",
    address: "8420 Pat Booker Rd, Live Oak, TX 78233",
    phone: "(210) 555-2840"
  },
  hospitalityNotes: "Lunch and refreshments provided on site Friday through Sunday. Coffee and breakfast tacos at check-in.",
  awardsDescription: "Hand-tied rosettes for first through fourth in every class, qualifying ribbons for all qualifying scores, an engraved bowl for High in Trial each day, and a silver platter for High Combined Master at weekend's end.",
  additionalNotes: "Soft-sided crates only in the crating hall. No flexi-leads on the trial floor. Please pick up after your dog.",

  // Generated narratives (editable)
  showHoursNarrative: "Doors open at 7:00 AM each day with check-in immediately following. Briefings begin at 7:45 AM and the first trial begins at 8:30 AM. An approximate end time of 5:30 PM is targeted, dependent on entry count.",
  trialInformationNarrative: "The June 2026 AKC event features six full Scent Work trials over three days at the Live Oak Civic Center. Trials cover all four elements — Containers, Interiors, Exteriors, and Buried — across Novice, Advanced, Excellent, and Master class levels, providing opportunities for dogs at every stage of their scent work career.",
  welcomeFromChair: "For seventy-nine years our club has put on shows that exhibitors look forward to. This spring we return with three days of scent work — a discipline built on partnership, patience, and the impossibly good nose of a willing dog. We hope you'll join us at Live Oak.",
  aboutTheClub: "Bexar County Kennel Club was founded in 1947 and has held licensed AKC events in the San Antonio area continuously since. The club hosts conformation, obedience, rally, and scent work events throughout the year, and is proud to be a member club of the American Kennel Club.",
  venueDescription: "The Live Oak Civic Center is an indoor, climate-controlled facility with sealed concrete flooring throughout. Crating is in the adjacent ballroom; parking is plentiful and free. The site is ten minutes from the airport and walkable to several hotels."
};
