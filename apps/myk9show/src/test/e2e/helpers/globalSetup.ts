import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test setup...');
  
  // Create browser for setup
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Wait for dev server to be ready
    const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:5173';
    console.log(`⏳ Waiting for dev server at ${baseURL}...`);
    
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      try {
        const response = await page.goto(baseURL, { timeout: 5000 });
        if (response?.ok()) {
          console.log('✅ Dev server is ready');
          break;
        }
      } catch {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`Dev server not ready after ${maxAttempts} attempts`);
        }
        console.log(`⏳ Dev server not ready, attempt ${attempts}/${maxAttempts}...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Setup test data
    console.log('📊 Setting up test data...');
    
    // Clear any existing test data
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear indexedDB if present
      if (window.indexedDB) {
        window.indexedDB.deleteDatabase('myK9Show-test');
      }
    });
    
    // Setup mock data for consistent testing
    await page.evaluate(() => {
      const mockDogs = Array.from({ length: 100 }, (_, i) => ({
        id: `dog-${i + 1}`,
        callName: `Dog${i + 1}`,
        registeredName: `Registered Dog ${i + 1}`,
        breed: ['Golden Retriever', 'Labrador', 'Border Collie', 'German Shepherd'][i % 4],
        gender: i % 2 === 0 ? 'Male' : 'Female',
        birthDate: new Date(2020 + (i % 4), (i % 12), (i % 28) + 1).toISOString(),
        ownerId: `owner-${Math.floor(i / 5) + 1}`,
        microchip: `12345678901234${i.toString().padStart(2, '0')}`,
        registrationNumber: `SS${(12345678 + i).toString()}`,
        registrationOrg: ['AKC', 'UKC', 'CKC'][i % 3]
      }));
      
      const mockOwners = Array.from({ length: 20 }, (_, i) => ({
        id: `owner-${i + 1}`,
        firstName: `Owner${i + 1}`,
        lastName: `LastName${i + 1}`,
        email: `owner${i + 1}@example.com`,
        phone: `555-${(1000 + i).toString()}`,
        address: `${i + 1} Test Street`,
        city: 'Test City',
        state: 'CA',
        zip: `9000${i.toString().padStart(2, '0')}`
      }));
      
      const mockShows = [
        {
          id: 'show-123',
          name: 'Test Dog Show 2025',
          startDate: '2025-02-15',
          endDate: '2025-02-16',
          location: 'Test Venue',
          organizationId: 'AKC',
          status: 'accepting_entries'
        }
      ];
      
      const mockClasses = [
        { id: 'novice-standard', name: 'Novice Standard', fee: 30 },
        { id: 'novice-jumpers', name: 'Novice Jumpers', fee: 30 },
        { id: 'open-standard', name: 'Open Standard', fee: 35 },
        { id: 'open-jumpers', name: 'Open Jumpers', fee: 35 },
        { id: 'excellent-standard', name: 'Excellent Standard', fee: 35 },
        { id: 'excellent-jumpers', name: 'Excellent Jumpers', fee: 35 },
        { id: 'novice-container', name: 'Novice Container Search', fee: 25 },
        { id: 'novice-interior', name: 'Novice Interior Search', fee: 25 },
        { id: 'expensive-special', name: 'Special Premium Class', fee: 100 }
      ];
      
      localStorage.setItem('test_dogs', JSON.stringify(mockDogs));
      localStorage.setItem('test_owners', JSON.stringify(mockOwners));
      localStorage.setItem('test_shows', JSON.stringify(mockShows));
      localStorage.setItem('test_classes', JSON.stringify(mockClasses));
      localStorage.setItem('e2e_test_mode', 'true');
    });
    
    console.log('✅ Test data setup complete');
    
    // Verify critical UI elements load
    console.log('🔍 Verifying app loads correctly...');
    
    // Check that main app container is present
    await page.waitForSelector('#root', { timeout: 10000 });
    
    // Check that routing works
    await page.goto(`${baseURL}/shows`);
    await page.waitForLoadState('networkidle');
    
    console.log('✅ App verification complete');
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
  
  console.log('🎉 E2E test setup completed successfully!');
}

export default globalSetup;