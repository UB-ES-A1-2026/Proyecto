import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { parseCorsPreviewPattern } from '../../src/config/env.js';
import { isAllowedOrigin } from '../../src/middlewares/corsMiddleware.js';

const PREVIEW_PATTERN =
  '^https://rentit-[a-z0-9-]+-ub-es-a1-2026\\.vercel\\.app$';

describe('parseCorsPreviewPattern', () => {
  it('returns null when the variable is not defined or empty', () => {
    expect(parseCorsPreviewPattern(undefined)).toBeNull();
    expect(parseCorsPreviewPattern('  ')).toBeNull();
  });

  it('accepts an anchored pattern for the project previews', () => {
    const pattern = parseCorsPreviewPattern(PREVIEW_PATTERN);

    expect(
      pattern?.test('https://rentit-git-feature-50-ub-es-a1-2026.vercel.app'),
    ).toBe(true);
  });

  it('rejects patterns that are not anchored or not https', () => {
    expect(() =>
      parseCorsPreviewPattern('https://rentit-[a-z0-9-]+\\.vercel\\.app'),
    ).toThrow('CORS_PREVIEW_PATTERN');
    expect(() =>
      parseCorsPreviewPattern('^http://rentit-[a-z0-9-]+\\.vercel\\.app$'),
    ).toThrow('CORS_PREVIEW_PATTERN');
  });

  it('rejects invalid regular expressions', () => {
    expect(() => parseCorsPreviewPattern('^https://rentit-[$')).toThrow(
      'expresión regular válida',
    );
  });

  it('rejects patterns that accept any vercel.app deployment', () => {
    expect(() => parseCorsPreviewPattern('^https://.*\\.vercel\\.app$')).toThrow(
      'demasiado amplia',
    );
    expect(() => parseCorsPreviewPattern('^https://.*$')).toThrow(
      'demasiado amplia',
    );
  });
});

describe('isAllowedOrigin', () => {
  const allowedOrigins = ['https://rentit.vercel.app'];
  const previewPattern = parseCorsPreviewPattern(PREVIEW_PATTERN);

  it('allows the exact origins of CORS_ORIGINS', () => {
    expect(
      isAllowedOrigin('https://rentit.vercel.app', allowedOrigins, null),
    ).toBe(true);
  });

  it('allows the project previews only when the pattern is defined', () => {
    const preview = 'https://rentit-abc123-ub-es-a1-2026.vercel.app';

    expect(isAllowedOrigin(preview, allowedOrigins, previewPattern)).toBe(true);
    expect(isAllowedOrigin(preview, allowedOrigins, null)).toBe(false);
  });

  it('rejects other deployments on vercel.app and other domains', () => {
    expect(
      isAllowedOrigin(
        'https://rentit-abc123-otro-equipo.vercel.app',
        allowedOrigins,
        previewPattern,
      ),
    ).toBe(false);
    expect(
      isAllowedOrigin('https://ejemplo.com', allowedOrigins, previewPattern),
    ).toBe(false);
  });
});

describe('CORS headers', () => {
  it('does not allow an unknown origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://ejemplo.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
