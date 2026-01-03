// Quick validation tests for Club Store Integration
import { describe, it, expect } from 'vitest';
import { 
  mapClubInputToInsert, 
  mapClubInputToUpdate, 
  mapDatabaseToClub,
  mapDatabaseClubsArray,
  mapClubToClubInput,
  validateClubData,
  createDefaultClubInput,
  formatClubDisplayName,
  formatClubAddress
} from '@/services/mappers/clubMappers';
import type { ClubInput } from '@/types/club-types';
import type { DbClub } from '@/types/database-mappings';

// Mock data
const mockClubInput: ClubInput = {
  name: 'Golden State Dog Club',
  clubNumber: 'GS001',
  email: 'info@gsdc.org',
  phone: '555-123-4567',
  website: 'https://gsdc.org',
  description: 'A premier dog club serving the Golden State region',
  logo: 'https://example.com/logo.png',
  street: '123 Dog Park Lane',
  city: 'Sacramento',
  state: 'CA',
  zipCode: '95814',
  country: 'US',
  founded: new Date('2010-01-15'),
  clubType: 'regional',
  memberIds: ['user1', 'user2', 'user3']
};

const mockDbClub: DbClub = {
  id: 'club_123',
  name: 'Golden State Dog Club',
  email: 'info@gsdc.org',
  phone: '555-123-4567',
  website: 'https://gsdc.org',
  description: 'A premier dog club serving the Golden State region',
  logo_url: 'https://example.com/logo.png',
  address: '123 Dog Park Lane, Sacramento, CA 95814, US',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-02T00:00:00.000Z',
  created_by: null,
  updated_by: null,
  deleted_at: null
};

const mockDbClubWithShows = {
  ...mockDbClub,
  show: [
    {
      id: 'show_1',
      name: 'Spring Agility Trial',
      start_date: '2030-04-15', // Far future date
      location: 'Sacramento Dog Park'
    },
    {
      id: 'show_2',
      name: 'Fall Championship',
      start_date: '2020-09-20', // Past date
      location: 'Golden Gate Park'
    }
  ]
};

describe('Club Mappers', () => {
  describe('mapClubInputToInsert', () => {
    it('should correctly map ClubInput to DbClubInsert', () => {
      const result = mapClubInputToInsert(mockClubInput);

      expect(result.name).toBe('Golden State Dog Club');
      expect(result.email).toBe('info@gsdc.org');
      expect(result.phone).toBe('555-123-4567');
      expect(result.website).toBe('https://gsdc.org');
      expect(result.description).toBe('A premier dog club serving the Golden State region');
      expect(result.logo_url).toBe('https://example.com/logo.png');
      expect(result.address).toBe('123 Dog Park Lane, Sacramento, CA 95814, US');
    });

    it('should handle optional fields correctly', () => {
      const minimalInput: ClubInput = {
        name: 'Simple Club',
        clubNumber: 'SC001',
        email: 'info@simple.org',
        phone: '555-000-0000',
        description: 'A simple club',
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '90210',
        country: 'US'
      };

      const result = mapClubInputToInsert(minimalInput);

      expect(result.name).toBe('Simple Club');
      expect(result.website).toBeNull();
      expect(result.logo_url).toBeNull();
    });
  });

  describe('mapClubInputToUpdate', () => {
    it('should correctly map partial ClubInput to DbClubUpdate', () => {
      const updates: Partial<ClubInput> = {
        name: 'Updated Club Name',
        email: 'newemail@gsdc.org',
        phone: '555-999-8888'
      };

      const result = mapClubInputToUpdate(updates);

      expect(result.name).toBe('Updated Club Name');
      expect(result.email).toBe('newemail@gsdc.org');
      expect(result.phone).toBe('555-999-8888');
      expect('club_number' in result).toBe(false);
      expect('description' in result).toBe(false);
    });

    it('should handle address updates', () => {
      const updates: Partial<ClubInput> = {
        street: '456 New Street',
        city: 'New City',
        state: 'NY',
        zipCode: '10001'
      };

      const result = mapClubInputToUpdate(updates);

      expect(result.address).toBe('456 New Street, New City, NY 10001');
    });
  });

  describe('mapDatabaseToClub', () => {
    it('should correctly map DbClub to Club', () => {
      const result = mapDatabaseToClub(mockDbClub);

      expect(result.id).toBe('club_123');
      expect(result.name).toBe('Golden State Dog Club');
      expect(result.clubNumber).toBe(''); // No club_number in basic schema
      expect(result.email).toBe('info@gsdc.org');
      expect(result.phone).toBe('555-123-4567');
      expect(result.website).toBe('https://gsdc.org');
      expect(result.description).toBe('A premier dog club serving the Golden State region');
      expect(result.logo).toBe('https://example.com/logo.png');
      expect(result.clubType).toBeUndefined(); // No club_type in basic schema
      
      // Check address parsing
      expect(result.address.street).toBe('123 Dog Park Lane');
      expect(result.address.city).toBe('Sacramento');
      expect(result.address.state).toBe('CA');
      expect(result.address.zipCode).toBe('95814');
      expect(result.address.country).toBe('US');
      
      // Check date parsing - no founded in basic schema
      expect(result.founded).toBeUndefined();
      
      // Check sync metadata
      expect(result._version).toBe(1);
      expect(result._syncStatus).toBe('synced');
      expect(result._localOnly).toBe(false);
    });

    it('should correctly parse shows and separate upcoming/past', () => {
      const result = mapDatabaseToClub(mockDbClubWithShows);

      expect(result.pastShows).toHaveLength(1);
      expect(result.pastShows[0].name).toBe('Fall Championship');
      expect(result.pastShows[0].date).toBe('2020-09-20');
      
      expect(result.upcomingShows).toHaveLength(1);
      expect(result.upcomingShows[0].name).toBe('Spring Agility Trial');
      expect(result.upcomingShows[0].date).toBe('2030-04-15');
    });
  });

  describe('mapDatabaseClubsArray', () => {
    it('should correctly map array of DbClub to array of Club', () => {
      const dbClubs = [mockDbClub, { ...mockDbClub, id: 'club_456', name: 'Another Club' }];
      const result = mapDatabaseClubsArray(dbClubs);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('club_123');
      expect(result[0].name).toBe('Golden State Dog Club');
      expect(result[1].id).toBe('club_456');
      expect(result[1].name).toBe('Another Club');
    });
  });

  describe('mapClubToClubInput', () => {
    it('should correctly map Club back to ClubInput', () => {
      const club = mapDatabaseToClub(mockDbClub);
      const result = mapClubToClubInput(club);

      expect(result.name).toBe(club.name);
      expect(result.clubNumber).toBe(club.clubNumber);
      expect(result.email).toBe(club.email);
      expect(result.phone).toBe(club.phone);
      expect(result.website).toBe(club.website);
      expect(result.description).toBe(club.description);
      expect(result.logo).toBe(club.logo);
      expect(result.street).toBe(club.address.street);
      expect(result.city).toBe(club.address.city);
      expect(result.state).toBe(club.address.state);
      expect(result.zipCode).toBe(club.address.zipCode);
      expect(result.country).toBe(club.address.country);
      expect(result.founded).toBe(club.founded);
      expect(result.clubType).toBe(club.clubType);
    });
  });

  describe('validateClubData', () => {
    it('should return no errors for valid club data', () => {
      const errors = validateClubData(mockClubInput);
      expect(errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', () => {
      const invalidClub: ClubInput = {
        name: '',
        clubNumber: 'GS001',
        email: 'invalid-email',
        phone: '',
        description: '',
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: ''
      };

      const errors = validateClubData(invalidClub);

      expect(errors).toContain('Club name is required');
      expect(errors).toContain('Valid email address is required');
      expect(errors).toContain('Club phone number is required');
      expect(errors).toContain('Club description is required');
      expect(errors).toContain('Street address is required');
      expect(errors).toContain('City is required');
      expect(errors).toContain('State is required');
      expect(errors).toContain('ZIP code is required');
      expect(errors).toContain('Country is required');
    });
  });

  describe('utility functions', () => {
    it('should create default club input', () => {
      const defaultInput = createDefaultClubInput();

      expect(defaultInput.name).toBe('');
      expect(defaultInput.country).toBe('US');
      expect(defaultInput.clubType).toBe('local');
      expect(defaultInput.memberIds).toEqual([]);
    });

    it('should format club display name correctly', () => {
      const club = mapDatabaseToClub(mockDbClub);
      const displayName = formatClubDisplayName(club);

      // Since club doesn't have clubNumber in basic schema, it should just be the name
      expect(displayName).toBe('Golden State Dog Club');

      // Test with a club that has a number
      const clubWithNumber = { ...club, clubNumber: 'GS001' };
      const displayNameWithNumber = formatClubDisplayName(clubWithNumber);

      expect(displayNameWithNumber).toBe('Golden State Dog Club (GS001)');
    });

    it('should format club address correctly', () => {
      const club = mapDatabaseToClub(mockDbClub);
      const formattedAddress = formatClubAddress(club.address);

      expect(formattedAddress).toBe('123 Dog Park Lane, Sacramento, CA 95814, US');
    });
  });
});