/**
 * Test Users for Playwright E2E Testing
 * These are real Supabase users created for consistent testing
 */

export interface TestUser {
  email: string;
  password: string;
  role: string;
  description: string;
}

export const TEST_USERS: Record<string, TestUser> = {
  SITE_ADMIN: {
    email: 'testadmin@example.com',
    password: 'TestAdmin123!',
    role: 'site_admin',
    description: 'Site administrator with full system access'
  },
  
  SECRETARY: {
    email: 'testsecretary@example.com', 
    password: 'TestSecretary123!',
    role: 'secretary',
    description: 'Show secretary with show management permissions'
  },
  
  JUDGE: {
    email: 'testjudge@example.com',
    password: 'TestJudge123!',
    role: 'judge', 
    description: 'Show judge with judging permissions'
  },
  
  CLUB_ADMIN: {
    email: 'testclubadmin@example.com',
    password: 'TestClubAdmin123!',
    role: 'club_admin',
    description: 'Club administrator with club management permissions'
  },
  
  EXHIBITOR: {
    email: 'testexhibitor@example.com',
    password: 'TestExhibitor123!', 
    role: 'exhibitor',
    description: 'Dog show exhibitor with basic entry permissions'
  }
};

/**
 * Helper function to sign in as a test user
 */
export async function signInAsTestUser(page: import('@playwright/test').Page, userType: keyof typeof TEST_USERS) {
  const user = TEST_USERS[userType];
  
  // Navigate to sign in page
  await page.goto('/auth/signin');
  
  // Fill in credentials
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  
  // Click sign in button
  await page.click('button[type="submit"]');
  
  // Wait for redirect to home page
  await page.waitForURL('/');
  
  return user;
}

/**
 * Helper function to sign out
 */
export async function signOut(page: import('@playwright/test').Page) {
  // Click user menu
  await page.click('[data-testid="user-menu"], button:has(svg)');
  
  // Click sign out
  await page.click('text="Sign Out"');
  
  // Wait for redirect to home/signin page
  await page.waitForURL(/\/(auth\/signin|$)/);
}