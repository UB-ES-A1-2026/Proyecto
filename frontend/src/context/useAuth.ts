import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './authContextValue';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) throw new Error('useAuth se tiene que usar dentro de <AuthProvider>');
  return context;
}
