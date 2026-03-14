import { describe, it, expect } from 'vitest';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';
import type { DbShow } from '@/types/database-mappings';

/**
 * Minimal valid DbShow fixture — only the fields required by the type.
 * Optional nullable fields are omitted so tests stay focused.
 */
const baseDbShow: DbShow = {
  id: 'show-1',
  name: 'Test Show',
  organization: 'AKC',
  start_date: '2026-06-01',
  end_date: '2026-06-02',
  // nullable fields
  accent_color: null,
  address: null,
  allow_non_owner_handlers: null,
  chairman: null,
  chief_steward: null,
  city: null,
  club_id: null,
  cover_image_url: null,
  created_at: null,
  day_of_show_fee: null,
  deleted_at: null,
  deleted_by: null,
  description: null,
  entry_close_date: null,
  entry_open_date: null,
  license_key: null,
  location: null,
  logo_url: null,
  max_entries_per_dog: null,
  max_total_entries: null,
  pre_entry_fee: null,
  results_released_at: null,
  results_visible_to_all: null,
  secretary: null,
  state: null,
  status: null,
  updated_at: null,
  venue_name: null,
  zip_code: null,
};

describe('mapDatabaseToShow — branding fallback', () => {
  it('falls back to club branding when show branding is null', () => {
    const result = mapDatabaseToShow({
      ...baseDbShow,
      logo_url: null,
      cover_image_url: null,
      accent_color: null,
      club: {
        id: 'club-1',
        name: 'Test Club',
        logo_url: 'https://club.example.com/logo.png',
        cover_image_url: 'https://club.example.com/cover.jpg',
        accent_color: '#ff0000',
      },
    });

    expect(result.logoUrl).toBe('https://club.example.com/logo.png');
    expect(result.coverImageUrl).toBe('https://club.example.com/cover.jpg');
    expect(result.accentColor).toBe('#ff0000');
  });

  it('prefers show branding over club branding', () => {
    const result = mapDatabaseToShow({
      ...baseDbShow,
      logo_url: 'https://show.example.com/logo.png',
      cover_image_url: 'https://show.example.com/cover.jpg',
      accent_color: '#0000ff',
      club: {
        id: 'club-1',
        name: 'Test Club',
        logo_url: 'https://club.example.com/logo.png',
        cover_image_url: 'https://club.example.com/cover.jpg',
        accent_color: '#ff0000',
      },
    });

    expect(result.logoUrl).toBe('https://show.example.com/logo.png');
    expect(result.coverImageUrl).toBe('https://show.example.com/cover.jpg');
    expect(result.accentColor).toBe('#0000ff');
  });

  it('returns empty strings when neither show nor club have branding', () => {
    const result = mapDatabaseToShow({
      ...baseDbShow,
      logo_url: null,
      cover_image_url: null,
      accent_color: null,
      club: {
        id: 'club-1',
        name: 'Test Club',
        logo_url: null,
        cover_image_url: null,
        accent_color: null,
      },
    });

    expect(result.logoUrl).toBe('');
    expect(result.coverImageUrl).toBe('');
    expect(result.accentColor).toBe('');
  });

  it('returns empty strings when club join is null', () => {
    const result = mapDatabaseToShow({
      ...baseDbShow,
      logo_url: null,
      cover_image_url: null,
      accent_color: null,
      club: null,
    });

    expect(result.logoUrl).toBe('');
    expect(result.coverImageUrl).toBe('');
    expect(result.accentColor).toBe('');
  });
});
