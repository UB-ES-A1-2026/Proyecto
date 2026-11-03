import type { RouteObject } from 'react-router';
import { Layout } from '../components/Layout';
import { PrivateRoute } from '../components/PrivateRoute';
import { AuthProvider } from '../context/AuthContext';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProfilePage } from '../pages/ProfilePage';
import { PublishItemPage } from '../pages/PublishItemPage';
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
          { path: 'objetos/nuevo', element: <PublishItemPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
