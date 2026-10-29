import type { RouteObject } from 'react-router';
import { Layout } from '../components/Layout';
import { PrivateRoute } from '../components/PrivateRoute';
import { AuthProvider } from '../context/AuthContext';
import { EditItemPage } from '../pages/EditItemPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { MyItemsPage } from '../pages/MyItemsPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RegisterPage } from '../pages/RegisterPage';

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
      {
        element: <PrivateRoute />,
        children: [
          { path: 'perfil', element: <ProfilePage /> },
          { path: 'mis-objetos', element: <MyItemsPage /> },
          { path: 'objetos/:id/editar', element: <EditItemPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
