// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 11/11/2026
import { prisma } from './prisma.js';

// Perfil público (US-01.4, #300). Se selecciona campo a campo: el correo, el hash de la
// contraseña, el rol y los datos de rider no se leen nunca aquí.
export function findPublicProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      bio: true,
      photoUrl: true,
      createdAt: true,
      status: true,
      // Solo los objetos publicados, el más nuevo primero.
      items: {
        where: { status: 'published' },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          title: true,
          dailyPrice: true,
          neighborhood: true,
        },
      },
    },
  });
}

export function updateBio(userId: string, bio: string | null) {
  return prisma.user.update({ where: { id: userId }, data: { bio } });
}

export async function findPhotoKey(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { photoUrl: true },
  });
  return user?.photoUrl ?? null;
}

// La columna foto_url guarda la clave del fichero en el bucket, no una URL (ADR 0002).
export function updatePhotoKey(userId: string, key: string | null) {
  return prisma.user.update({
    where: { id: userId },
    data: { photoUrl: key },
  });
}
