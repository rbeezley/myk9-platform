import { Page, expect } from '@playwright/test';

export class VisualTestHelper {
  constructor(private page: Page) {}

  /**
   * Wait for page to fully load including all images and fonts
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForLoadState('domcontentloaded');
    
    // Wait for fonts to load
    await this.page.waitForFunction(() => document.fonts.ready);
    
    // Wait for any loading spinners to disappear
    try {
      await this.page.waitForSelector('[data-testid="loading-spinner"]', { 
        state: 'hidden', 
        timeout: 5000 
      });
    } catch {
      // Ignore if no loading spinner exists
    }

    // Wait for any skeleton loaders to disappear
    try {
      await this.page.waitForSelector('[data-testid="skeleton-loader"]', { 
        state: 'hidden', 
        timeout: 5000 
      });
    } catch {
      // Ignore if no skeleton loader exists
    }

    // Small delay to ensure all animations complete
    await this.page.waitForTimeout(300);
  }

  /**
   * Mock dog list data for consistent testing
   */
  async mockDogListData() {
    await this.page.route('**/api/dogs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'dog-1',
            callName: 'Buddy',
            registeredName: 'Champion Buddy of Excellence',
            breed: 'Golden Retriever',
            sex: 'Male',
            birthDate: '2020-01-15',
            ownerId: 'user-1',
            status: 'active'
          },
          {
            id: 'dog-2',
            callName: 'Luna',
            registeredName: 'Moonlight Luna Star',
            breed: 'Border Collie',
            sex: 'Female',
            birthDate: '2019-05-20',
            ownerId: 'user-1',
            status: 'active'
          },
          {
            id: 'dog-3',
            callName: 'Max',
            registeredName: 'Maximum Speed Champion',
            breed: 'German Shepherd',
            sex: 'Male',
            birthDate: '2021-03-10',
            ownerId: 'user-1',
            status: 'active'
          }
        ])
      });
    });
  }

  /**
   * Mock empty dog list for empty state testing
   */
  async mockEmptyDogList() {
    await this.page.route('**/api/dogs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
  }

  /**
   * Mock dog details data
   */
  async mockDogDetailsData() {
    await this.page.route('**/api/dogs/dog-123', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'dog-123',
          callName: 'Buddy',
          registeredName: 'Champion Buddy of Excellence',
          breed: 'Golden Retriever',
          sex: 'Male',
          birthDate: '2020-01-15',
          ownerId: 'user-1',
          registrations: [
            {
              organization: 'AKC',
              number: 'WS12345678',
              status: 'active'
            }
          ],
          healthRecords: [
            {
              type: 'vaccination',
              name: 'Rabies',
              date: '2023-01-15',
              vetName: 'Dr. Smith'
            },
            {
              type: 'examination',
              name: 'Annual Checkup',
              date: '2023-06-10',
              vetName: 'Dr. Johnson'
            }
          ],
          achievements: [
            {
              title: 'Best in Show',
              date: '2023-05-15',
              event: 'Regional Dog Show'
            }
          ]
        })
      });
    });
  }

  /**
   * Mock show list data
   */
  async mockShowListData() {
    await this.page.route('**/api/shows', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'show-1',
            name: 'Spring Agility Championship',
            location: 'Central Park, NY',
            startDate: '2024-04-15',
            endDate: '2024-04-16',
            status: 'upcoming',
            organization: 'AKC',
            entryDeadline: '2024-04-01',
            maxEntries: 150,
            currentEntries: 87
          },
          {
            id: 'show-2',
            name: 'Summer Scent Work Trial',
            location: 'Riverside Arena, CA',
            startDate: '2024-06-20',
            endDate: '2024-06-21',
            status: 'open',
            organization: 'NACSW',
            entryDeadline: '2024-06-05',
            maxEntries: 100,
            currentEntries: 45
          },
          {
            id: 'show-3',
            name: 'Fall Obedience Trials',
            location: 'Training Center, TX',
            startDate: '2024-09-10',
            endDate: '2024-09-12',
            status: 'planning',
            organization: 'UKC',
            entryDeadline: '2024-08-25',
            maxEntries: 200,
            currentEntries: 0
          }
        ])
      });
    });
  }

  /**
   * Mock show details data
   */
  async mockShowDetailsData() {
    await this.page.route('**/api/shows/show-123', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'show-123',
          name: 'Spring Agility Championship',
          location: 'Central Park, NY',
          startDate: '2024-04-15',
          endDate: '2024-04-16',
          status: 'upcoming',
          organization: 'AKC',
          description: 'Annual spring agility championship featuring novice through masters levels.',
          entryFee: 35.00,
          entryDeadline: '2024-04-01',
          maxEntries: 150,
          currentEntries: 87,
          classes: [
            {
              id: 'class-1',
              name: 'Novice Standard',
              level: 'Novice',
              type: 'Standard',
              maxTime: 60,
              entries: 25
            },
            {
              id: 'class-2',
              name: 'Open Jumpers',
              level: 'Open',
              type: 'Jumpers',
              maxTime: 45,
              entries: 18
            }
          ],
          judges: [
            {
              id: 'judge-1',
              name: 'Sarah Johnson',
              level: 'Masters',
              assignments: ['Novice Standard', 'Open Standard']
            }
          ]
        })
      });
    });
  }

  /**
   * Mock registration workflow data
   */
  async mockRegistrationData() {
    await this.mockDogListData();
    
    await this.page.route('**/api/shows/show-123/classes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'class-1',
            name: 'Novice Standard',
            level: 'Novice',
            type: 'Standard',
            entryFee: 35.00,
            maxEntries: 30,
            currentEntries: 15,
            available: true
          },
          {
            id: 'class-2',
            name: 'Open Jumpers',
            level: 'Open',
            type: 'Jumpers',
            entryFee: 32.00,
            maxEntries: 25,
            currentEntries: 20,
            available: true
          },
          {
            id: 'class-3',
            name: 'Masters Standard',
            level: 'Masters',
            type: 'Standard',
            entryFee: 38.00,
            maxEntries: 20,
            currentEntries: 20,
            available: false
          }
        ])
      });
    });
  }

  /**
   * Complete registration step 1 (dog selection)
   */
  async completeRegistrationStep1() {
    await this.waitForPageLoad();
    await this.page.click('[data-testid="select-dog-1"]');
    await this.page.click('[data-testid="next-step-button"]');
    await this.waitForPageLoad();
  }

  /**
   * Complete registration step 2 (class selection)
   */
  async completeRegistrationStep2() {
    await this.waitForPageLoad();
    await this.page.click('[data-testid="select-class-1"]');
    await this.page.click('[data-testid="next-step-button"]');
    await this.waitForPageLoad();
  }

  /**
   * Complete full registration workflow
   */
  async completeFullRegistration() {
    await this.completeRegistrationStep1();
    await this.completeRegistrationStep2();
    
    // Payment step
    await this.page.click('[data-testid="payment-method-check"]');
    await this.page.fill('[data-testid="check-number"]', '12345');
    await this.page.click('[data-testid="submit-payment-button"]');
    await this.waitForPageLoad();
  }

  /**
   * Mock template list data
   */
  async mockTemplateListData() {
    await this.page.route('**/api/templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'template-1',
            name: 'AKC Agility Standard',
            organization: 'AKC',
            showType: 'AGILITY',
            description: 'Standard AKC agility class template',
            createdDate: '2023-01-15',
            lastModified: '2023-06-10',
            isActive: true
          },
          {
            id: 'template-2',
            name: 'NACSW Scent Work Template',
            organization: 'NACSW',
            showType: 'SCENT_WORK',
            description: 'NACSW scent work trial template',
            createdDate: '2023-02-20',
            lastModified: '2023-05-15',
            isActive: true
          },
          {
            id: 'template-3',
            name: 'UKC Obedience Template',
            organization: 'UKC',
            showType: 'OBEDIENCE',
            description: 'UKC obedience trial template',
            createdDate: '2023-03-01',
            lastModified: '2023-04-20',
            isActive: false
          }
        ])
      });
    });
  }

  /**
   * Mock template edit data
   */
  async mockTemplateEditData() {
    await this.page.route('**/api/templates/template-123', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'template-123',
          name: 'AKC Agility Standard',
          organization: 'AKC',
          showType: 'AGILITY',
          description: 'Standard AKC agility class template',
          fields: [
            {
              name: 'maxEntries',
              type: 'admin-set',
              dataType: 'number',
              displayName: 'Maximum Entries',
              defaultValue: '30',
              required: true
            },
            {
              name: 'entryFee',
              type: 'admin-set',
              dataType: 'currency',
              displayName: 'Entry Fee',
              defaultValue: '35.00',
              required: true
            },
            {
              name: 'maxTime',
              type: 'admin-set',
              dataType: 'number',
              displayName: 'Maximum Time (seconds)',
              defaultValue: '60',
              required: false
            }
          ],
          rules: [
            {
              condition: 'level === "Masters"',
              action: 'setField',
              target: 'entryFee',
              value: '38.00'
            }
          ]
        })
      });
    });
  }

  /**
   * Mock search suggestions
   */
  async mockSearchSuggestions() {
    await this.page.route('**/api/search/suggestions**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { type: 'show', name: 'Agility Championship', id: 'show-1' },
          { type: 'location', name: 'Agility Training Center', id: 'loc-1' },
          { type: 'organization', name: 'American Kennel Club', id: 'org-1' }
        ])
      });
    });
  }

  /**
   * Mock entries table data
   */
  async mockEntriesTableData() {
    await this.page.route('**/api/entries', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'entry-1',
            entryNumber: 'E001',
            dogName: 'Buddy',
            handlerName: 'John Smith',
            className: 'Novice Standard',
            status: 'confirmed',
            paymentStatus: 'paid',
            entryFee: 35.00
          },
          {
            id: 'entry-2',
            entryNumber: 'E002',
            dogName: 'Luna',
            handlerName: 'Jane Doe',
            className: 'Open Jumpers',
            status: 'pending',
            paymentStatus: 'pending',
            entryFee: 32.00
          },
          {
            id: 'entry-3',
            entryNumber: 'E003',
            dogName: 'Max',
            handlerName: 'Bob Johnson',
            className: 'Masters Standard',
            status: 'confirmed',
            paymentStatus: 'paid',
            entryFee: 38.00
          }
        ])
      });
    });
  }

  /**
   * Mock entry management data
   */
  async mockEntryManagementData() {
    await this.mockEntriesTableData();
    
    await this.page.route('**/api/shows/show-123/statistics', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalEntries: 87,
          confirmedEntries: 65,
          pendingEntries: 22,
          totalRevenue: 2845.00,
          paidRevenue: 2175.00,
          pendingRevenue: 670.00
        })
      });
    });
  }

  /**
   * Fill out dog form with test data
   */
  async fillDogForm() {
    await this.page.fill('[data-testid="dog-call-name"]', 'Test Dog');
    await this.page.fill('[data-testid="dog-registered-name"]', 'Test Champion Dog of Excellence');
    await this.page.selectOption('[data-testid="dog-breed"]', 'Golden Retriever');
    await this.page.selectOption('[data-testid="dog-sex"]', 'Male');
    await this.page.fill('[data-testid="dog-birth-date"]', '2020-01-15');
  }

  /**
   * Set viewport for responsive testing
   */
  async setMobileViewport() {
    await this.page.setViewportSize({ width: 375, height: 667 });
  }

  async setTabletViewport() {
    await this.page.setViewportSize({ width: 768, height: 1024 });
  }

  async setDesktopViewport() {
    await this.page.setViewportSize({ width: 1920, height: 1080 });
  }

  /**
   * Switch theme for theme testing
   */
  async switchToDarkTheme() {
    await this.page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await this.page.waitForTimeout(300); // Wait for theme transition
  }

  async switchToLightTheme() {
    await this.page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await this.page.waitForTimeout(300); // Wait for theme transition
  }

  /**
   * Disable animations for consistent screenshots
   */
  async disableAnimations() {
    await this.page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          scroll-behavior: auto !important;
        }
      `
    });
  }

  /**
   * Simulate slow network for loading states
   */
  async simulateSlowNetwork() {
    await this.page.route('**/api/**', async (route) => {
      // Delay all API responses by 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });
  }

  /**
   * Simulate network error
   */
  async simulateNetworkError() {
    await this.page.route('**/api/**', route => route.abort());
  }

  /**
   * Take screenshot with consistent naming
   */
  async takeNamedScreenshot(name: string, options: Record<string, unknown> = {}) {
    const defaultOptions = {
      fullPage: true,
      animations: 'disabled',
      ...options
    };
    
    await expect(this.page).toHaveScreenshot(`${name}.png`, defaultOptions);
  }

  /**
   * Take element screenshot
   */
  async takeElementScreenshot(selector: string, name: string) {
    const element = this.page.locator(selector);
    await expect(element).toHaveScreenshot(`${name}.png`);
  }
}