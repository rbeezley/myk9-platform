// Data source configuration
// This file controls whether the app uses mock data or Supabase
// Set USE_MOCK_DATA to false when Supabase tables are ready

export const DATA_SOURCE = {
  USE_MOCK_DATA: false, // Set to false when Supabase is ready
  
  // Feature flags for gradual migration
  FEATURES: {
    USE_MOCK_PEOPLE: false,
    USE_MOCK_DOGS: false,
    USE_MOCK_SHOWS: false, // All mock data disabled - production mode
    USE_MOCK_CLUBS: false,
    USE_MOCK_REGISTRATIONS: false,
    USE_MOCK_HEALTH_RECORDS: false,
  }
};

// Helper to check if we should use mock data for a specific feature
export const shouldUseMockData = (feature: keyof typeof DATA_SOURCE.FEATURES): boolean => {
  return DATA_SOURCE.USE_MOCK_DATA || DATA_SOURCE.FEATURES[feature];
};