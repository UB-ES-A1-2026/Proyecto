import { Navigate, type RouteObject } from 'react-router';
import { Layout } from '../components/Layout';
import { PrivateRoute } from '../components/PrivateRoute';
import { AuthProvider } from '../context/AuthContext';
import { HelpPage } from '../pages/HelpPage';
import { HomePage } from '../pages/HomePage';
import { ItemDetailPage } from '../pages/ItemDetailPage';
import { LoginPage } from '../pages/LoginPage';
import { MyItemsPage } from '../pages/MyItemsPage';
import { MyReservationsPage } from '../pages/MyReservationsPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProfilePage } from '../pages/ProfilePage';
import { PublishItemPage } from '../pages/PublishItemPage';
import { RegisterPage } from '../pages/RegisterPage';
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
      { path: 'buscar', element: <SearchPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'registro', element: <RegisterPage /> },
      { path: 'objetos/:id', element: <ItemDetailPage /> },
      // El alquiler ahora está en la ficha: los enlaces antiguos a esta pantalla siguen funcionando.
      { path: 'objetos/:id/solicitar', element: <Navigate to=".." relative="path" replace /> },
      { path: 'ayuda', element: <HelpPage /> },
      {
        element: <PrivateRoute />,
        children: [
          { path: 'perfil', element: <ProfilePage /> },
          { path: 'mis-objetos', element: <MyItemsPage /> },
          { path: 'mis-solicitudes', element: <MyReservationsPage /> },
          { path: 'objetos/nuevo', element: <PublishItemPage /> },
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
