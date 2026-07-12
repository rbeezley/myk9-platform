import { describe, it, expect } from 'vitest';
import { mapDatabaseToShow, mapReplicatedShowToDbRow } from '@/services/mappers/showMappers';
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
  starting_armband_number: 100,
  // nullable fields
  accent_color: null,
  accept_cash_payments: false,
  accept_check_payments: false,
  withdrawal_cutoff_date: null,
  withdrawal_policy_notes: null,
  withdrawal_retention_type: null,
  withdrawal_retention_value: null,
  address: null,
  allow_non_owner_handlers: null,
  city: null,
  brand_color: '#000000',
  cc_secretary_on_exhibitor_emails: false,
  club_id: null,
  confirmation_message: null,
  cover_image_url: null,
  created_at: null,
  day_of_show_fee: null,
  default_judge_day_capacity: 0,
  deleted_at: null,
  deleted_by: null,
  description: null,
  entry_close_date: null,
  entry_open_date: null,
  experience_is_published: false,
  experience_published_at: null,
  experience_published_content: null,
  experience_published_style: null,
  is_nationals: false,
  license_key: null,
  location: null,
  logo_url: null,
  mail_in_auto_release: false,
  mail_in_deadline: null,
  mail_in_release_date: null,
  mail_in_strategy: null,
  mail_in_value: null,
  max_entries_per_dog: null,
  max_total_entries: null,
  pre_entry_fee: null,
  published_premium_at: null,
  published_premium_url: null,
  results_released_at: null,
  results_visible_to_all: null,
  secretary_email: null,
  state: null,
  status: null,
  style: 'monogram',
  updated_at: null,
  venue_name: null,
  venue_wifi_network: null,
  venue_wifi_password: null,
  version: 1,
  waitlist_payment_deadline_hours: 24,
  zip_code: null,
};

describe('mapDatabaseToShow — branding fallback', () => {
  it('maps show-level judge assignment names from the people join shape', () => {
    const result = mapDatabaseToShow({
      ...baseDbShow,
      judge_assignments: [
        {
          id: 'assignment-1',
          person_id: 'person-1',
          show_id: 'show-1',
          class_id: null,
          confirmed_at: '2026-05-01T12:00:00Z',
          people: {
            id: 'person-1',
            first_name: 'Liz',
            last_name: 'Beezley',
            email: 'liz@example.com',
          },
        },
      ],
    } as never);

    expect(result.assignedJudges).toEqual([
      {
        judgeId: 'person-1',
        judgeName: 'Liz Beezley',
        assignedDate: '2026-05-01',
        assignedClasses: [],
      },
    ]);
  });

  it('preserves joined trial class structure needed for wizard cloning', () => {
    const result = mapDatabaseToShow({
      ...baseDbShow,
      trials: [
        {
          id: 'trial-1',
          name: 'Friday Trial',
          date: '2026-06-01',
          trial_number: 'T1',
          status: 'completed',
          trial_type: 'Nosework',
          class: [
            {
              id: 'class-1',
              name: 'Novice Containers',
              entry_fee: 28,
              level: 'Novice',
              element: 'Containers',
              section: 'B',
            },
          ],
        },
      ],
    } as never);

    expect(result.trials[0]?.classes).toEqual([
      expect.objectContaining({
        id: 'class-1',
        name: 'Novice Containers',
        entryFee: 28,
        level: 'Novice',
        element: 'Containers',
        section: 'B',
      }),
    ]);
  });

  it('attaches replicated classes to replicated trial rows for show queries', () => {
    const row = mapReplicatedShowToDbRow(
      {
        id: 'show-1',
        name: 'Test Show',
        organization: 'UKC',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        location: 'Test Venue',
        status: 'completed',
        entryOpenDate: '2026-05-01',
        entryCloseDate: '2026-05-15',
        preEntryFee: 28,
        clubId: 'club-1',
      },
      {
        trials: [
          {
            id: 'trial-1',
            showId: 'show-1',
            name: 'Friday Trial',
            date: '2026-06-01',
            trialType: 'Nosework',
          },
        ],
        classesByTrial: new Map([
          [
            'trial-1',
            [
              {
                id: 'class-1',
                trialId: 'trial-1',
                name: 'Novice Containers',
                element: 'Containers',
                level: 'Novice',
                section: 'B',
                entryFee: 28,
              },
            ],
          ],
        ]),
      }
    );

    const trial = (row.trials as Array<{ class: Array<Record<string, unknown>> }>)[0];
    expect(trial.class).toEqual([
      expect.objectContaining({
        id: 'class-1',
        name: 'Novice Containers',
        element: 'Containers',
        level: 'Novice',
        section: 'B',
        entry_fee: 28,
      }),
    ]);
  });

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

  it('maps published experience columns from Supabase to Show', () => {
    const show = mapDatabaseToShow({
      ...baseDbShow,
      experience_is_published: true,
      experience_published_at: '2026-05-09T14:00:00.000Z',
      experience_published_style: 'heritage',
      experience_published_content: {
        narratives: {
          showHours: 'Doors open at 7:00 AM.',
          trialInformation: 'Running order will be posted before judging.',
        },
        supplemental: {
          vetClinic: null,
          accommodations: [],
          coverImageUrl: null,
          hospitalityNotes: 'Coffee in the morning.',
          awardsDescription: null,
          additionalNotes: null,
        },
        outputs: { premiumUrl: 'https://example.com/premium.pdf' },
      },
    } as never);

    expect(show.experienceIsPublished).toBe(true);
    expect(show.experiencePublishedStyle).toBe('heritage');
    expect(show.experiencePublishedContent?.narratives.showHours).toBe('Doors open at 7:00 AM.');
  });

  it('preserves published experience fields when mapping replicated shows to DB rows', () => {
    const row = mapReplicatedShowToDbRow({
      id: 'show-1',
      name: 'Test Show',
      organization: 'AKC',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      style: 'poster',
      experienceIsPublished: true,
      experiencePublishedAt: '2026-05-09T14:00:00.000Z',
      experiencePublishedStyle: 'poster',
      experiencePublishedContent: {
        style: 'poster',
        generatedAt: '2026-05-09T14:00:00.000Z',
        narratives: {
          showHours: 'Doors open at 7:00 AM.',
          trialInformation: 'Running order will be posted before judging.',
        },
        supplemental: {
          vetClinic: null,
          accommodations: [],
          coverImageUrl: null,
          hospitalityNotes: null,
          awardsDescription: null,
          additionalNotes: null,
        },
        outputs: { premiumUrl: 'https://example.com/premium.pdf' },
      },
    });

    expect(row.experience_is_published).toBe(true);
    expect(row.experience_published_at).toBe('2026-05-09T14:00:00.000Z');
    expect(row.experience_published_style).toBe('poster');
    expect(
      (row.experience_published_content as { narratives: { showHours: string } }).narratives
        .showHours
    ).toBe('Doors open at 7:00 AM.');
  });
});
