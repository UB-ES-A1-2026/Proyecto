import { prisma } from './prisma.js';

// Generado con asistencia de IA (Claude) – revisado por Maxim Nicolau, 11/11/2026
// Las búsquedas incluyen el estado de la solicitud de rider para el login y el perfil (US-10.03).
const withRiderApplication = {
  riderApplication: { select: { status: true } },
} as const;

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: withRiderApplication,
  });
}

export function findUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } });
}

export function createUser(data: {
  username: string;
  email: string;
  passwordHash: string;
}) {
  return prisma.user.create({ data });
}

export function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: withRiderApplication,
  });
}
