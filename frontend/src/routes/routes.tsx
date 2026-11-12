import { Navigate, type RouteObject } from 'react-router';
import { Layout } from '../components/Layout';
import { MyProfileRedirect } from '../components/MyProfileRedirect';
import { PrivateRoute } from '../components/PrivateRoute';
import { AuthProvider } from '../context/AuthContext';
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
      // Perfil público (US-01.4): lo puede ver cualquiera.
      { path: 'usuarios/:id', element: <PublicProfilePage /> },
      // El alquiler ahora está en la ficha: los enlaces antiguos a esta pantalla siguen funcionando.
      { path: 'objetos/:id/solicitar', element: <Navigate to=".." relative="path" replace /> },
      { path: 'ayuda', element: <HelpPage /> },
      {
        element: <PrivateRoute />,
        children: [
          // Solo hay un perfil, el público: «Mi perfil» es el tuyo, con edición.
          { path: 'perfil', element: <MyProfileRedirect /> },
          { path: 'mis-objetos', element: <MyItemsPage /> },
          { path: 'mis-solicitudes', element: <MyReservationsPage /> },
          { path: 'objetos/nuevo', element: <PublishItemPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
