export interface Competition {
  id: string;
  name: string;
  date: string;
  location: string;
  status: 'Upcoming' | 'Completed' | 'Cancelled';
  dogId: string;
  // Add more fields as needed for your UI
}
