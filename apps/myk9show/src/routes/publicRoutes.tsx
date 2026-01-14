/**
 * Public Routes - Lazy loaded routes for public/exhibitor functionality
 * 
 * Includes show browsing, entries, registration, and exhibitor features
 */

import React, { lazy } from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { SuspenseWrapper } from './utils/SuspenseWrapper';

// Public page lazy imports
const UserDetailsPage = lazy(() => import('@/pages/UserDetailsPage'));
const DogDetailsPage = lazy(() => import('@/pages/DogDetailsPage'));
const ClubsPage = lazy(() => import('@/pages/ClubsPage'));
const ShowDetailsPage = lazy(() => import('@/pages/ShowDetailsPage'));
const TrialDetailsPage = lazy(() => import('@/pages/TrialDetailsPage'));
const ClassDetailsPage = lazy(() => import('@/pages/ClassDetailsPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage'));
const PreferencesPage = lazy(() => import('@/pages/PreferencesPage'));

// Exhibitor pages
const BrowseShowsPage = lazy(() => import('@/pages/BrowseShowsPage'));
const ExhibitorDashboard = lazy(() => import('@/pages/ExhibitorDashboard'));
const ClassCheckIn = lazy(() => import('@/components/exhibitor/ClassCheckIn'));

// Test pages
const ClassTemplateTestPage = lazy(() => import('@/components/classes/ClassTemplateTestPage').then(m => ({ default: m.ClassTemplateTestPage })));

export const PublicRoutes = () => (
  <>
    {/* Show Management Routes - Allow anonymous browsing */}
    <Route path="/shows" element={
      <SuspenseWrapper>
        <PageTransition><ShowDetailsPage /></PageTransition>
      </SuspenseWrapper>
    } />
    
    <Route path="/shows/:id" element={
      <SuspenseWrapper>
        <PageTransition><ShowDetailsPage /></PageTransition>
      </SuspenseWrapper>
    } />
    
    <Route path="/shows/:showId/trials/:trialId" element={
      <SuspenseWrapper>
        <PageTransition><TrialDetailsPage /></PageTransition>
      </SuspenseWrapper>
    } />
    
    <Route path="/trials/:trialId" element={
      <SuspenseWrapper>
        <PageTransition><TrialDetailsPage /></PageTransition>
      </SuspenseWrapper>
    } />
    
    <Route path="/shows/:showId/trials/:trialId/classes/:classId" element={
      <SuspenseWrapper>
        <PageTransition><ClassDetailsPage /></PageTransition>
      </SuspenseWrapper>
    } />

    <Route path="/shows/:showId/trials/:trialId/classes/:classId/results" element={
      <SuspenseWrapper>
        <PageTransition><ClassDetailsPage /></PageTransition>
      </SuspenseWrapper>
    } />

    <Route path="/classes/:classId" element={
      <SuspenseWrapper>
        <PageTransition><ClassDetailsPage /></PageTransition>
      </SuspenseWrapper>
    } />

    {/* Unified Shows Interface - Allow anonymous browsing */}
    <Route path="/browse-shows" element={
      <SuspenseWrapper>
        <PageTransition><BrowseShowsPage /></PageTransition>
      </SuspenseWrapper>
    } />
    
    <Route path="/shows/browse" element={
      <SuspenseWrapper>
        <PageTransition><BrowseShowsPage /></PageTransition>
      </SuspenseWrapper>
    } />
    
    {/* Legacy route redirect - My Entries functionality now in unified interface */}
    <Route path="/my-entries" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><BrowseShowsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Exhibitor Dashboard and Features */}
    <Route path="/exhibitor/dashboard" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><ExhibitorDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/account" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><ExhibitorDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/entries" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><BrowseShowsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/entries/history" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><BrowseShowsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/results" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><BrowseShowsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/favorites" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><BrowseShowsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/health-records" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><DogDetailsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/training" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><DogDetailsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/forms" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><ExhibitorDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/standards" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><ExhibitorDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/help" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><ExhibitorDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/exhibitor/check-in/:entryId" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><ClassCheckIn /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Users and Dogs Management */}
    <Route path="/users" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><UserDetailsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/users/:id" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><UserDetailsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/dogs" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><DogDetailsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/dogs/:id" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><DogDetailsPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    <Route path="/clubs" element={
      <SuspenseWrapper>
        <PageTransition><ClubsPage /></PageTransition>
      </SuspenseWrapper>
    } />
    
    <Route path="/clubs/:id" element={
      <SuspenseWrapper>
        <PageTransition><ClubsPage /></PageTransition>
      </SuspenseWrapper>
    } />

    {/* Feature Pages */}
    <Route path="/preferences" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><PreferencesPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/calendar" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><CalendarPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
    
    
    
    <Route path="/subscription" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><SubscriptionPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/registration" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><CalendarPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Test Routes */}
    <Route path="/class-templates" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><ClassTemplateTestPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
  </>
);