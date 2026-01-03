/**
 * Secretary Routes - Lazy loaded routes for secretary functionality
 * 
 * Includes class management, run order, and show administration
 */

import React, { lazy } from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { UserRole } from '@/types/auth-types';
import { SuspenseWrapper } from './utils/SuspenseWrapper';

// Secretary page lazy imports
const SecretaryDashboard = lazy(() => import('@/pages/SecretaryDashboard'));
// Lazy import for better performance
const CreateShowPage = lazy(() => import('@/pages/secretary/CreateShowPage'));
const ShowCreationWizardPage = lazy(() => import('@/pages/secretary/ShowCreationWizardPage'));
const ClassCreationPage = lazy(() => import('@/pages/secretary/ClassCreationPage').then(m => ({ default: m.ClassCreationPage })));
const ClassManagementPage = lazy(() => import('@/pages/secretary/ClassManagementPage').then(m => ({ default: m.ClassManagementPage })));
const RunOrderPage = lazy(() => import('@/pages/secretary/RunOrderPage').then(m => ({ default: m.RunOrderPage })));

// Secretary components
const SecretaryClassDashboard = lazy(() => import('@/components/secretary/SecretaryClassDashboard').then(m => ({ default: m.SecretaryClassDashboard })));
const SyncDashboardPage = lazy(() => import('@/pages/sync/SyncDashboardPage').then(m => ({ default: m.SyncDashboardPage })));

// Entry management
const EntryManagementPage = lazy(() => import('@/pages/secretary/EntryManagementPage').catch(() => ({ default: () => <div>Entry Management Coming Soon</div> })));

export const SecretaryRoutes = () => (
  <>
    {/* Secretary Dashboard */}
    <Route path="/secretary/dashboard" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><SecretaryDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Create Show Route */}
    <Route path="/secretary/create-show" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><CreateShowPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Show Creation Wizard Page */}
    <Route path="/secretary/create-show/wizard" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><ShowCreationWizardPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Class Management Routes */}
    <Route path="/trials/:trialId/classes/create" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><ClassCreationPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/trials/:trialId/classes" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><ClassManagementPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/secretary/run-order" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><RunOrderPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Class-specific Secretary Management */}
    <Route path="/shows/:showId/trials/:trialId/classes/:classId/secretary" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><SecretaryClassDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Entry Management */}
    <Route path="/secretary/entries" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><EntryManagementPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Sync Management for Secretaries */}
    <Route path="/sync/dashboard" element={
      <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><SyncDashboardPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
  </>
);