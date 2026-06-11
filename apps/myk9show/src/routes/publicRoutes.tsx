/**
 * Public & Exhibitor Routes - Lazy loaded routes
 *
 * All routes render inside UnifiedAppLayout (sidebar provided by parent).
 * Browse pages are public; exhibitor pages require authentication.
 *
 * Feature-flagged routes (features.* === false) render ComingSoonPage instead
 * of the real component. Flip the flag in src/config/features.ts and redeploy
 * to unlock — no other code changes required.
 */

import { lazy, type ReactNode } from 'react';
import { Route, Navigate, useParams } from 'react-router-dom';
import { BarChart3, Calendar, ClipboardList } from 'lucide-react';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { ClassDetailsRedirect } from './ClassDetailsRedirect';
import { LegacyCheckInRedirect, LegacyShowDayRedirect } from './LegacyExhibitorRedirects';
import { ComingSoonPage, type ComingSoonPageProps } from '@/components/common/ComingSoonPage';
import { features } from '@/config/features';
import { UserRole } from '@/types/auth-types';
import BrowseDogsPage from '@/pages/BrowseDogsPage';
import DogDetailPage from '@/pages/DogDetailPage';
import ShowDetailsPrototype from '@/pages/ShowDetailsPrototype';

function featurePage(enabled: boolean, page: ReactNode, coming: ComingSoonPageProps): ReactNode {
  return enabled ? (
    <SuspenseWrapper>
      <PageTransition>{page}</PageTransition>
    </SuspenseWrapper>
  ) : (
    <ComingSoonPage {...coming} />
  );
}

// Public page lazy imports
const BrowseClubsPage = lazy(() => import('@/pages/BrowseClubsPage'));
const ClubDetailPage = lazy(() => import('@/pages/ClubDetailPage'));
const ShowDetailsPage = lazy(() => import('@/pages/ShowDetailsPage'));
const ShowWorkbenchSetupPage = lazy(() =>
  import('@/pages/secretary/ShowWorkbenchSetupPage').then(m => ({
    default: m.ShowWorkbenchSetupPage,
  }))
);
const ShowWorkbenchShowDeskPage = lazy(() =>
  import('@/pages/secretary/ShowWorkbenchShowDeskPage').then(m => ({
    default: m.ShowWorkbenchShowDeskPage,
  }))
);
const EntryManagementPage = lazy(() => import('@/pages/secretary/EntryManagementPage'));
const ReportsPage = lazy(() => import('@/pages/secretary/ReportsPage'));
const ResultsControlPage = lazy(() => import('@/pages/secretary/ResultsControlPage'));
const ResultsSubmissionPage = lazy(() => import('@/pages/secretary/ResultsSubmissionPage'));
const TrialDetailsPage = lazy(() => import('@/pages/TrialDetailsPage'));
const ClassDetailsPage = lazy(() => import('@/pages/ClassDetailsPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const RegistrationWizardPage = lazy(() => import('@/pages/RegistrationWizardPage'));
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const CredentialsHelpPage = lazy(() => import('@/pages/CredentialsHelpPage'));

// Account (merged profile + preferences + settings)
const AccountPage = lazy(() => import('@/pages/AccountPage'));

// Exhibitor pages
const BrowseShowsPage = lazy(() => import('@/pages/BrowseShowsPage'));
const MyEntriesPage = lazy(() => import('@/pages/MyEntriesPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));

// TV Display
const TVDisplay = lazy(() => import('@/pages/TVDisplay'));

// Messages
const ChatPage = lazy(() => import('@/features/messages/pages/ChatPage'));

// Notifications history
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));

// Cart and checkout pages
const CartPage = lazy(() => import('@/pages/CartPage'));
const CheckoutSuccessPage = lazy(() => import('@/pages/CheckoutSuccessPage'));
const CheckoutCancelPage = lazy(() => import('@/pages/CheckoutCancelPage'));

function ShowManagementSectionRoute({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id?: string }>();
  const canonicalShowPath = id ? `/shows/${id}` : '/shows';

  return (
    <ProtectedRoute
      redirectTo={canonicalShowPath}
      requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}
      fallback={<Navigate to={canonicalShowPath} replace />}
    >
      {children}
    </ProtectedRoute>
  );
}

export const PublicRoutes = () => (
  <>
    {/* Browse Shows - Allow anonymous browsing */}
    <Route
      path="/shows"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <BrowseShowsPage />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    <Route
      path="/shows/:id"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <ShowDetailsPage />
          </PageTransition>
        </SuspenseWrapper>
      }
    >
      <Route
        path="setup"
        element={
          <ShowManagementSectionRoute>
            <SuspenseWrapper>
              <ShowWorkbenchSetupPage />
            </SuspenseWrapper>
          </ShowManagementSectionRoute>
        }
      />
      <Route
        path="show-desk"
        element={
          <ShowManagementSectionRoute>
            <SuspenseWrapper>
              <ShowWorkbenchShowDeskPage />
            </SuspenseWrapper>
          </ShowManagementSectionRoute>
        }
      />
      <Route
        path="entry-management"
        element={
          <ShowManagementSectionRoute>
            <SuspenseWrapper>
              <EntryManagementPage />
            </SuspenseWrapper>
          </ShowManagementSectionRoute>
        }
      />
      <Route
        path="reports"
        element={
          <ShowManagementSectionRoute>
            <SuspenseWrapper>
              <ReportsPage />
            </SuspenseWrapper>
          </ShowManagementSectionRoute>
        }
      />
      <Route
        path="results-control"
        element={
          <ShowManagementSectionRoute>
            <SuspenseWrapper>
              <ResultsControlPage />
            </SuspenseWrapper>
          </ShowManagementSectionRoute>
        }
      />
      <Route
        path="submit-results"
        element={
          <ShowManagementSectionRoute>
            <SuspenseWrapper>
              <ResultsSubmissionPage />
            </SuspenseWrapper>
          </ShowManagementSectionRoute>
        }
      />
    </Route>

    <Route
      path="/shows/:showId/register"
      element={
        <ProtectedRoute>
          {featurePage(features.showRegistration, <RegistrationWizardPage />, {
            title: 'Show Registration',
            description:
              'Online show entry is coming soon. Your dogs and training data will be ready and waiting when it arrives.',
            icon: ClipboardList,
          })}
        </ProtectedRoute>
      }
    />

    <Route
      path="/shows/:showId/trials/:trialId"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <TrialDetailsPage />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    <Route
      path="/trials/:trialId"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <TrialDetailsPage />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    <Route
      path="/shows/:showId/trials/:trialId/classes/:classId"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <ClassDetailsPage />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    <Route
      path="/shows/:showId/trials/:trialId/classes/:classId/results"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <ClassDetailsPage />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    <Route path="/classes/:classId" element={<ClassDetailsRedirect />} />

    {/* Backwards-compat redirects for old URLs */}
    <Route path="/browse-shows" element={<Navigate to="/shows" replace />} />
    <Route path="/shows/browse" element={<Navigate to="/shows" replace />} />

    {/* My Shows - exhibitor's show hub; entries are one section inside it. */}
    <Route
      path="/my-entries"
      element={
        <ProtectedRoute>
          {featurePage(features.myEntries, <MyEntriesPage />, {
            title: 'My Shows',
            description:
              'Your entries, dogs, and upcoming shows are ready here when you need them.',
            icon: ClipboardList,
          })}
        </ProtectedRoute>
      }
    />

    {/* Exhibitor pages — flat routes, no separate layout */}
    <Route path="/exhibitor/dashboard" element={<Navigate to="/exhibitor/entries" replace />} />
    <Route
      path="/exhibitor/show-day"
      element={
        <ProtectedRoute>
          <LegacyShowDayRedirect />
        </ProtectedRoute>
      }
    />
    <Route path="/exhibitor/profile" element={<Navigate to="/profile" replace />} />
    <Route path="/exhibitor/account" element={<Navigate to="/account" replace />} />
    <Route
      path="/exhibitor/analytics"
      element={
        <ProtectedRoute>
          {featurePage(features.analytics, <AnalyticsPage />, {
            title: 'Analytics',
            description: 'Performance analytics and statistics are coming soon.',
            icon: BarChart3,
          })}
        </ProtectedRoute>
      }
    />
    <Route
      path="/exhibitor/entries"
      element={
        <ProtectedRoute>
          {featurePage(features.myEntries, <MyEntriesPage />, {
            title: 'My Shows',
            description:
              'Your entries, dogs, and upcoming shows are ready here when you need them.',
            icon: ClipboardList,
          })}
        </ProtectedRoute>
      }
    />
    <Route
      path="/exhibitor/check-in/:entryId"
      element={
        <ProtectedRoute>
          <LegacyCheckInRedirect />
        </ProtectedRoute>
      }
    />

    {/* /profile redirects to /people/{personId} */}
    <Route
      path="/profile"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <ProfilePage />
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Notifications history */}
    <Route
      path="/notifications"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <NotificationsPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Account (unified profile + preferences + settings) */}
    <Route
      path="/account"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <AccountPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Legacy redirects */}
    <Route path="/settings" element={<Navigate to="/account" replace />} />

    {/* Cart and Checkout */}
    <Route
      path="/cart"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <CartPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    <Route
      path="/checkout/success"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <CheckoutSuccessPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    <Route
      path="/checkout/cancel"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <CheckoutCancelPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Dogs */}
    <Route
      path="/dogs"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <BrowseDogsPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    <Route
      path="/dogs/:id"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <DogDetailPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Clubs */}
    <Route
      path="/clubs"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <BrowseClubsPage />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    <Route
      path="/clubs/:id"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <ClubDetailPage />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    {/* Feature Pages */}
    <Route path="/preferences" element={<Navigate to="/account" replace />} />

    <Route
      path="/calendar"
      element={
        <ProtectedRoute>
          {featurePage(features.calendar, <CalendarPage />, {
            title: 'Calendar',
            description:
              'The show calendar is coming soon. Your dogs and training data will be ready and waiting when it arrives.',
            icon: Calendar,
          })}
        </ProtectedRoute>
      }
    />

    <Route
      path="/subscription"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <SubscriptionPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    <Route
      path="/registration"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <CalendarPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* TV Run Order Display — public, no auth required */}
    <Route
      path="/tv/:showId"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <TVDisplay />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    {/* Messages */}
    <Route
      path="/messages/:showId"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <ChatPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Legal Pages — public, no auth required */}
    <Route
      path="/terms"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <LegalPage title="Terms of Service" markdownPath="/legal/terms-of-service.md" />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    <Route
      path="/privacy"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <LegalPage title="Privacy Policy" markdownPath="/legal/privacy-policy.md" />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    {/* Credentials help — public, no auth required */}
    <Route
      path="/help/credentials"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <CredentialsHelpPage />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    {/* Design prototype — no auth, dev iteration only */}
    {import.meta.env.DEV && <Route path="/prototype/show" element={<ShowDetailsPrototype />} />}
  </>
);
