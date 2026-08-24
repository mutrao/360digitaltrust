import { Navigate, createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { RouteGuard } from './RouteGuard';
import { NotFoundPage } from './NotFoundPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { RequestsPage } from '@/features/requests/RequestsPage';
import { RequestDetailPage } from '@/features/requests/RequestDetailPage';
import { NewRequestPage } from '@/features/requests/NewRequestPage';
import { QuickSignPage } from '@/features/signature/QuickSignPage';
import { VerifyPage } from '@/features/signature/VerifyPage';
import { SignersPage } from '@/features/signers/SignersPage';
import { KeysPage } from '@/features/keys/KeysPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { DiagnosticPage } from '@/features/admin/DiagnosticPage';
import {
  AdminAboutPage,
  AdminAuthPage,
  AdminBrandingPage,
  AdminOrganisationPage,
  AdminSecurityPage,
} from '@/features/admin/AdminPages';

export const router = createBrowserRouter([
  {
    // Absorbe le retour de Keycloak avant le montage des écrans applicatifs.
    path: '/auth/callback',
    element: <Navigate to="/" replace />,
  },
  {
    path: '/',
    element: (
      <RouteGuard>
        <AppShell />
      </RouteGuard>
    ),
    children: [
      { index: true, element: <DashboardPage /> },

      { path: 'demandes', element: <RequestsPage /> },
      { path: 'demandes/nouvelle', element: <NewRequestPage /> },
      { path: 'demandes/:id', element: <RequestDetailPage /> },

      { path: 'signer', element: <QuickSignPage /> },
      { path: 'verifier', element: <VerifyPage /> },

      {
        path: 'signataires',
        element: (
          <RouteGuard permission="signer:manage">
            <SignersPage />
          </RouteGuard>
        ),
      },
      {
        path: 'cles',
        element: (
          <RouteGuard permission="key:generate">
            <KeysPage />
          </RouteGuard>
        ),
      },
      {
        path: 'audit',
        element: (
          <RouteGuard permission="audit:view">
            <AuditPage />
          </RouteGuard>
        ),
      },

      {
        path: 'administration',
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminOrganisationPage /> },
          { path: 'authentification', element: <AdminAuthPage /> },
          { path: 'branding', element: <AdminBrandingPage /> },
          { path: 'securite', element: <AdminSecurityPage /> },
          { path: 'diagnostic', element: <DiagnosticPage /> },
          { path: 'a-propos', element: <AdminAboutPage /> },
        ],
      },

      { path: 'parametres', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
