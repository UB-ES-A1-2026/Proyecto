import { Navigate, type RouteObject } from 'react-router';
import { Layout } from '../components/Layout';
import { PrivateRoute } from '../components/PrivateRoute';
import { ApprovedRiderRoute, GuestOnlyRoute, RenterOnlyRoute } from '../components/RiderRoutes';
import { AuthProvider } from '../context/AuthContext';
import { BecomeRiderPage } from '../pages/BecomeRiderPage';
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
import { RiderJobsPage } from '../pages/RiderJobsPage';
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
      { path: 'login', element: <LoginPage /> },
      { path: 'registro', element: <RegisterPage /> },
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
          // El alquiler ahora está en la ficha: los enlaces antiguos a esta pantalla siguen funcionando.
          { path: 'objetos/:id/solicitar', element: <Navigate to=".." relative="path" replace /> },
          {
            element: <PrivateRoute />,
            children: [
              { path: 'mis-objetos', element: <MyItemsPage /> },
              { path: 'mis-solicitudes', element: <MyReservationsPage /> },
              { path: 'objetos/nuevo', element: <PublishItemPage /> },
            ],
          },
        ],
      },
      {
        element: <PrivateRoute />,
        children: [{ path: 'perfil', element: <ProfilePage /> }],
      },
      {
        element: <ApprovedRiderRoute />,
        children: [{ path: 'trabajos', element: <RiderJobsPage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
