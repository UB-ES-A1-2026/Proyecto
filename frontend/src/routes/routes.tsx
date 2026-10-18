import type { RouteObject } from 'react-router';
import { Layout } from '../components/Layout';
import { AuthProvider } from '../context/AuthContext';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
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
      { path: 'perfil', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
