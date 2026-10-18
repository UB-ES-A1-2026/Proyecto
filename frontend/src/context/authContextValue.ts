import { createContext } from 'react';
import type { Session } from '../services/authService';

export type AuthContextValue = {
  session: Session | null;
  saveSession: (session: Session) => void;
  clearSession: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
