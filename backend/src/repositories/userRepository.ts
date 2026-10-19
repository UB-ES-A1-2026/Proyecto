import { prisma } from './prisma.js';

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
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
