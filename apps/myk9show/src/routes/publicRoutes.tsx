/**
 * Public & Exhibitor Routes - Lazy loaded routes
 *
 * All routes render inside UnifiedAppLayout (sidebar provided by parent).
 * Browse pages are public; exhibitor pages require authentication.
 */

import { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { SuspenseWrapper } from './utils/SuspenseWrapper';

// Public page lazy imports
const BrowsePeoplePage = lazy(() => import('@/pages/BrowsePeoplePage'));
const PersonDetailPage = lazy(() => import('@/pages/PersonDetailPage'));
const BrowseDogsPage = lazy(() => import('@/pages/BrowseDogsPage'));
const DogDetailPage = lazy(() => import('@/pages/DogDetailPage'));
const BrowseClubsPage = lazy(() => import('@/pages/BrowseClubsPage'));
const ClubDetailPage = lazy(() => import('@/pages/ClubDetailPage'));
const ShowDetailsPage = lazy(() => import('@/pages/ShowDetailsPage'));
const TrialDetailsPage = lazy(() => import('@/pages/TrialDetailsPage'));
const ClassDetailsPage = lazy(() => import('@/pages/ClassDetailsPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const RegistrationWizardPage = lazy(() => import('@/pages/RegistrationWizardPage'));
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage'));
const PreferencesPage = lazy(() => import('@/pages/PreferencesPage'));

// Exhibitor pages
const BrowseShowsPage = lazy(() => import('@/pages/BrowseShowsPage'));
const MyEntriesPage = lazy(() => import('@/pages/MyEntriesPage'));
const ExhibitorDashboard = lazy(() => import('@/pages/ExhibitorDashboard'));
const ProfileRedirect = lazy(() => import('@/pages/ProfileRedirect'));
const ClassCheckIn = lazy(() => import('@/components/exhibitor/ClassCheckIn'));

// Cart and checkout pages
const CartPage = lazy(() => import('@/pages/CartPage'));
const CheckoutSuccessPage = lazy(() => import('@/pages/CheckoutSuccessPage'));
const CheckoutCancelPage = lazy(() => import('@/pages/CheckoutCancelPage'));

// Test pages
const ClassTemplateTestPage = lazy(() =>
  import('@/components/classes/ClassTemplateTestPage').then(m => ({
    default: m.ClassTemplateTestPage,
  }))
);

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
    />

    <Route
      path="/shows/:showId/register"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <RegistrationWizardPage />
            </PageTransition>
          </SuspenseWrapper>
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

    <Route
      path="/classes/:classId"
      element={
        <SuspenseWrapper>
          <PageTransition>
            <ClassDetailsPage />
          </PageTransition>
        </SuspenseWrapper>
      }
    />

    {/* Backwards-compat redirects for old URLs */}
    <Route path="/browse-shows" element={<Navigate to="/shows" replace />} />
    <Route path="/shows/browse" element={<Navigate to="/shows" replace />} />

    {/* My Entries - View and manage exhibitor's entries */}
    <Route
      path="/my-entries"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <MyEntriesPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Exhibitor pages — flat routes, no separate layout */}
    <Route
      path="/exhibitor/dashboard"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <ExhibitorDashboard />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/exhibitor/profile"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <ProfileRedirect />
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/exhibitor/account"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <ProfileRedirect />
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/exhibitor/entries"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <MyEntriesPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/exhibitor/entries/history"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <MyEntriesPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/exhibitor/check-in/:entryId"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <ClassCheckIn />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* /profile redirects to /users/{personId} */}
    <Route
      path="/profile"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <ProfileRedirect />
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

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

    {/* People */}
    <Route
      path="/people"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <BrowsePeoplePage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    {/* Legacy redirect */}
    <Route path="/users" element={<Navigate to="/people" replace />} />

    <Route
      path="/users/:id"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <PersonDetailPage />
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
    <Route
      path="/preferences"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <PreferencesPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    <Route
      path="/calendar"
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

    {/* Test Routes */}
    <Route
      path="/class-templates"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <ClassTemplateTestPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
  </>
);
