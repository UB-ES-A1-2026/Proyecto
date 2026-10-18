import { afterEach, describe, expect, it } from 'vitest';
import { resetDb } from './db.js';

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe('resetDb', () => {
  it('refuses to truncate a database other than rentit_test', async () => {
    process.env.DATABASE_URL = 'postgresql://rentit:rentit@localhost:5432/rentit';

    await expect(resetDb()).rejects.toThrow(
      'resetDb() solo puede ejecutarse con la base de datos rentit_test',
    );
  });
});
