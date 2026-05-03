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
import { ClassDetailsRedirect } from './ClassDetailsRedirect';

// Public page lazy imports
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
const LegalPage = lazy(() => import('@/pages/LegalPage'));

// Account (merged profile + preferences + settings)
const AccountPage = lazy(() => import('@/pages/AccountPage'));

// Exhibitor pages
const BrowseShowsPage = lazy(() => import('@/pages/BrowseShowsPage'));
const MyEntriesPage = lazy(() => import('@/pages/MyEntriesPage'));
const ShowDayPage = lazy(() => import('@/pages/ShowDayPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const ClassCheckInPage = lazy(() => import('@/pages/ClassCheckInPage'));
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

    <Route path="/classes/:classId" element={<ClassDetailsRedirect />} />

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
    <Route path="/exhibitor/dashboard" element={<Navigate to="/exhibitor/entries" replace />} />
    <Route
      path="/exhibitor/show-day"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <ShowDayPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route path="/exhibitor/profile" element={<Navigate to="/profile" replace />} />
    <Route path="/exhibitor/account" element={<Navigate to="/account" replace />} />
    <Route
      path="/exhibitor/analytics"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <AnalyticsPage />
            </PageTransition>
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
      path="/exhibitor/check-in/:entryId"
      element={
        <ProtectedRoute>
          <SuspenseWrapper>
            <PageTransition>
              <ClassCheckInPage />
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
  </>
);
