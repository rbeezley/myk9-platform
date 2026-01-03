export interface Ancestor {
  id: string;
  name: string;
  title?: string;
  registration?: string;
  dateOfBirth?: string;
  gender?: 'Male' | 'Female';
  breed?: string;
  color?: string;
  healthInfo?: string;
  imageUrl?: string;
}
