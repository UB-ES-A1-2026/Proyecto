// Datos que requireAuth deja en la petición para las rutas privadas.
declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string };
    }
  }
}

export {};
