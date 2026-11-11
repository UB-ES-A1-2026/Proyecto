import { prisma } from './prisma.js';

export function insertSession(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  return prisma.session.create({ data });
}

export function findSessionByTokenHash(tokenHash: string) {
  return prisma.session.findUnique({ where: { tokenHash } });
}

export function markSessionRevoked(sessionId: string, revokedAt: Date) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt },
  });
}
