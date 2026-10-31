import type { RouteObject } from 'react-router';
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
import { RentalRequestPage } from '../pages/RentalRequestPage';
import { SearchPage } from '../pages/SearchPage';

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
      { path: 'ayuda', element: <HelpPage /> },
      {
        element: <PrivateRoute />,
        children: [
          { path: 'perfil', element: <ProfilePage /> },
          { path: 'mis-objetos', element: <MyItemsPage /> },
          { path: 'mis-solicitudes', element: <MyReservationsPage /> },
          { path: 'objetos/nuevo', element: <PublishItemPage /> },
          { path: 'objetos/:id/solicitar', element: <RentalRequestPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
