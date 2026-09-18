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
import { BarChart3, ClipboardList } from 'lucide-react';
import { ProtectedRoute } from '@/context/AuthContext';
import { useAuthContext } from '@/hooks/useAuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { RoleSurfaceErrorBoundary } from '@/components/common/RoleSurfaceErrorBoundary';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { ClassDetailsRedirect } from './ClassDetailsRedirect';
import { MyEntriesRedirect } from './MyEntriesRedirect';
import { ComingSoonPage, type ComingSoonPageProps } from '@/components/common/ComingSoonPage';
import { features } from '@/config/features';
import DogDetailPage from '@/pages/DogDetailPage';
import ShowDetailsPrototype from '@/pages/ShowDetailsPrototype';
import {
  SHOW_MANAGEMENT_SECTIONS,
  LEGACY_SHOW_SECTION_REDIRECTS,
  type ShowManagementSectionPath,
} from './showManagementSections';
import { LegacyShowSectionRedirect } from './LegacyShowSectionRedirect';
import { useShowManageScope } from '@/hooks/useShowManageScope';

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
const BrowseDogsPage = lazy(() => import('@/pages/BrowseDogsPage'));
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
const ClassManagementPage = lazy(() =>
  import('@/pages/secretary/ClassManagementPage').then(m => ({ default: m.ClassManagementPage }))
);
const ClassCreationPage = lazy(() =>
  import('@/pages/secretary/ClassCreationPage').then(m => ({ default: m.ClassCreationPage }))
);
const EntryManagementPage = lazy(() => import('@/pages/secretary/EntryManagementPage'));
const ReportsPage = lazy(() => import('@/pages/secretary/ReportsPage'));
const ShowResultsSection = lazy(() => import('@/pages/secretary/ShowResultsSection'));
const TrialDetailsPage = lazy(() => import('@/pages/TrialDetailsPage'));
const ClassDetailsPage = lazy(() => import('@/pages/ClassDetailsPage'));
const RegistrationWizardPage = lazy(() => import('@/pages/RegistrationWizardPage'));
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const CredentialsHelpPage = lazy(() => import('@/pages/CredentialsHelpPage'));
const FeesPage = lazy(() => import('@/pages/FeesPage'));
const SupportTicketPage = lazy(() => import('@/pages/SupportTicketPage'));

// Account (merged profile + preferences + settings)
const AccountPage = lazy(() => import('@/pages/AccountPage'));

// Exhibitor pages
const BrowseShowsPage = lazy(() => import('@/pages/BrowseShowsPage'));
const MyEntriesPage = lazy(() => import('@/pages/MyEntriesPage'));
const ExhibitorPaymentsPage = lazy(() => import('@/pages/exhibitor/ExhibitorPaymentsPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));

// TV Display
const TVDisplay = lazy(() => import('@/pages/TVDisplay'));

// Messages
const ChatPage = lazy(() => import('@/features/messages/pages/ChatPage'));

// Notifications history

// Cart and checkout pages
const CartPage = lazy(() => import('@/pages/CartPage'));
const CheckoutSuccessPage = lazy(() => import('@/pages/CheckoutSuccessPage'));
const CheckoutCancelPage = lazy(() => import('@/pages/CheckoutCancelPage'));

const SHOW_MANAGEMENT_SECTION_ELEMENTS: Record<ShowManagementSectionPath, ReactNode> = {
  setup: <ShowWorkbenchSetupPage />,
  entries: <EntryManagementPage />,
  'show-day': <ShowWorkbenchShowDeskPage />,
  results: <ShowResultsSection />,
  reports: <ReportsPage />,
};

function ShowManagementSectionRoute({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id?: string }>();
  const canonicalShowPath = id ? `/shows/${id}` : '/shows';
  const { user, loading: authLoading, rbacLoading } = useAuthContext();
  // Same gate the page bodies use, so the route and the surface it admits can
  // never disagree about who manages this show.
  const manageScope = useShowManageScope(id);

  if (authLoading || rbacLoading) return null;
  if (!user) return <Navigate to={canonicalShowPath} replace />;

  // Hold — never redirect — while ownership is still resolving. Redirecting on a
  // transient state bounces a legitimate secretary off their own show on every
  // cold deep link.
  if (manageScope.status === 'resolving') return null;

  // Fail closed: both `resolved && !canManage` and `unavailable` (show missing,
  // soft-deleted, or unreadable) land on the canonical show page rather than a
  // blank screen.
  if (!manageScope.canManage) return <Navigate to={canonicalShowPath} replace />;

  // Show-management URLs live in the public show route tree, but once authorized
  // this surface is secretary work and should report with secretary context.
  return <RoleSurfaceErrorBoundary surface="secretary">{children}</RoleSurfaceErrorBoundary>;
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

    <Route path="/shows/new" element={<Navigate to="/secretary/create-show/wizard" replace />} />

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
      {SHOW_MANAGEMENT_SECTIONS.map(({ path }) => (
        <Route
          key={path}
          path={path}
          element={
            <ShowManagementSectionRoute>
              <SuspenseWrapper>{SHOW_MANAGEMENT_SECTION_ELEMENTS[path]}</SuspenseWrapper>
            </ShowManagementSectionRoute>
          }
        />
      ))}
      {/* Every URL the deleted five-link row and the old section nav emitted is
          still a real route; it redirects into the tab that absorbed it, search
          and hash intact, so bookmarks and the sidebar keep working. */}
      {Object.entries(LEGACY_SHOW_SECTION_REDIRECTS).map(([legacyPath, target]) => (
        <Route
          key={legacyPath}
          path={legacyPath}
          element={<LegacyShowSectionRedirect target={target} />}
        />
      ))}
      <Route
        path="classes/:trialId"
        element={
          <ShowManagementSectionRoute>
            <SuspenseWrapper>
              <ClassManagementPage />
            </SuspenseWrapper>
          </ShowManagementSectionRoute>
        }
      />
      <Route
        path="classes/:trialId/create"
        element={
          <ShowManagementSectionRoute>
            <SuspenseWrapper>
              <ClassCreationPage />
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
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <TrialDetailsPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    <Route
      path="/trials/:trialId"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <TrialDetailsPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    <Route
      path="/shows/:showId/trials/:trialId/classes/:classId"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <ClassDetailsPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
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

    <Route
      path="/classes/:classId"
      element={
        <ProtectedRoute>
          <ClassDetailsRedirect />
        </ProtectedRoute>
      }
    />

    {/* Backwards-compat redirects for old URLs */}
    <Route path="/browse-shows" element={<Navigate to="/shows" replace />} />
    <Route path="/shows/browse" element={<Navigate to="/shows" replace />} />

    <Route
      path="/support"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <SupportTicketPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Legacy My Shows path. The canonical route is /exhibitor/entries; this
        stays as a redirect so old bookmarks and e2e specs resolve. It carries
        the query string and hash across — My Shows reads ?resultEntryId= and
        ?waitlistOffer= from them. */}
    <Route path="/my-entries" element={<MyEntriesRedirect />} />

    {/* Exhibitor pages — flat routes, no separate layout */}
    <Route path="/exhibitor/dashboard" element={<Navigate to="/exhibitor/entries" replace />} />
    <Route path="/exhibitor/profile" element={<Navigate to="/account" replace />} />
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
      path="/exhibitor/payments"
      element={
        <ProtectedRoute>
          <ExhibitorPaymentsPage />
        </ProtectedRoute>
      }
    />

    <Route path="/profile" element={<Navigate to="/account" replace />} />

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
          <Navigate to="/shows" replace />
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

    {/*
      INTENT: /sms must stay PUBLIC and reachable without signing in. Mobile
      carriers verify an SMS program's opt-in disclosure by loading a URL
      during A2P 10DLC review; putting this behind auth shows the reviewer a
      login wall and gets the campaign rejected for "opt-in not verifiable."
      See docs/operations/sms-10dlc-registration.md § 3.1.
    */}
    <Route
      path="/sms"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <LegalPage title="SMS Ring Alerts" markdownPath="/legal/sms-alerts.md" />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    {/*
      INTENT: /fees must stay PUBLIC (MYK9-229). It exists so a club admin can
      forward one URL that answers "why is there a service fee?" verbatim —
      to a treasurer, a board, or an exhibitor who has not signed up. Behind
      auth it stops being shareable and the club is back to paraphrasing, which
      is how "about half is card processing" becomes a claim we never made.
    */}
    <Route
      path="/fees"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <FeesPage />
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
