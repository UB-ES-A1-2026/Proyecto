import type { RouteObject } from 'react-router';
import { Layout } from '../components/Layout';
import { MyProfileRedirect } from '../components/MyProfileRedirect';
import { PrivateRoute } from '../components/PrivateRoute';
import { ApprovedRiderRoute, GuestOnlyRoute, RenterOnlyRoute } from '../components/RiderRoutes';
import { AuthProvider } from '../context/AuthContext';
import { BecomeRiderPage } from '../pages/BecomeRiderPage';
import { ConfirmRentalPage } from '../pages/ConfirmRentalPage';
import { HelpPage } from '../pages/HelpPage';
import { HomePage } from '../pages/HomePage';
import { ItemDetailPage } from '../pages/ItemDetailPage';
import { LoginPage } from '../pages/LoginPage';
import { MyItemsPage } from '../pages/MyItemsPage';
import { MyReservationsPage } from '../pages/MyReservationsPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PublicProfilePage } from '../pages/PublicProfilePage';
import { PublishItemPage } from '../pages/PublishItemPage';
import { RegisterPage } from '../pages/RegisterPage';
import { RiderJobsPage } from '../pages/RiderJobsPage';
import { SearchPage } from '../pages/SearchPage';
import { AdminActiveRidersPage } from '../pages/AdminActiveRidersPage';
import { AdminDashboardPage } from '../pages/AdminDashboardPage';
import { AdminItemsPage } from '../pages/AdminItemsPage';
import { AdminRiderApplicationsPage } from '../pages/AdminRiderApplicationsPage';
import { AdminLayout } from '../components/AdminLayout';
import { AdminRoute } from '../components/AdminRoute';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <AuthProvider>
        <Layout />
      </AuthProvider>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'registro', element: <RegisterPage /> },
      // Perfil público (US-01.4): lo puede ver cualquiera.
      { path: 'usuarios/:id', element: <PublicProfilePage /> },
      { path: 'ayuda', element: <HelpPage /> },
      // «Hazte rider» (US-10.03): solo sin sesión, porque la cuenta de rider es aparte.
      {
        element: <GuestOnlyRoute />,
        children: [{ path: 'hazte-rider', element: <BecomeRiderPage /> }],
      },
      // Un rider solo ve el estado de su solicitud y «Trabajos» (US-10.03): estas rutas de
      // arrendatario lo devuelven al inicio.
      {
        element: <RenterOnlyRoute />,
        children: [
          { path: 'buscar', element: <SearchPage /> },
          { path: 'objetos/:id', element: <ItemDetailPage /> },
          {
            element: <PrivateRoute />,
            children: [
              { path: 'mis-objetos', element: <MyItemsPage /> },
              { path: 'mis-solicitudes', element: <MyReservationsPage /> },
              { path: 'objetos/nuevo', element: <PublishItemPage /> },
              // «Confirmar y pagar» (US-07.01): el resumen y el pago, con las fechas en la dirección.
              { path: 'objetos/:id/solicitar', element: <ConfirmRentalPage /> },
            ],
          },
        ],
      },
      {
        element: <PrivateRoute />,
        children: [
          // Solo hay un perfil, el público: «Mi perfil» es el tuyo, con edición. Un rider ve en él
          // su bloque de rider (US-10.03).
          { path: 'perfil', element: <MyProfileRedirect /> },
          {
            element: <ApprovedRiderRoute />,
            children: [{ path: 'trabajos', element: <RiderJobsPage /> }],
          },
        ],
      },
      {
        element: <AdminRoute />,
        children: [
          {
            path: 'admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminDashboardPage /> },
              { path: 'objetos', element: <AdminItemsPage /> },
              { path: 'riders', element: <AdminActiveRidersPage /> },
              { path: 'solicitudes', element: <AdminRiderApplicationsPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
