export interface PerformanceData {
  month: string;
  shows: number;
  placements: number;
  earnings: number;
  expenses: number;
  firstPlace: number;
  secondPlace: number;
  thirdPlace: number;
}

export interface DogPerformance {
  id: string;
  name: string;
  breed: string;
  shows: number;
  wins: number;
  winRate: number;
  earnings: number;
  lastShow: Date;
}

export interface ShowStats {
  totalShows: number;
  totalPlacements: number;
  winRate: number;
  averageRating: number;
  totalEarnings: number;
  totalExpenses: number;
  netProfit: number;
}

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; positive: boolean };
  color?: 'default' | 'success' | 'warning' | 'danger';
}
