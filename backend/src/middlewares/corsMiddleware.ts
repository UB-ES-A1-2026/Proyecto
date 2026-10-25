import cors from 'cors';
import { env } from '../config/env.js';

// Orígenes exactos de CORS_ORIGINS y, si está definida, las previews de Vercel de CORS_PREVIEW_PATTERN (#96).
export function isAllowedOrigin(
  origin: string,
  allowedOrigins: readonly string[],
  previewPattern: RegExp | null,
): boolean {
  return (
    allowedOrigins.includes(origin) || (previewPattern?.test(origin) ?? false)
  );
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (
      !origin ||
      isAllowedOrigin(origin, env.corsOrigins, env.corsPreviewPattern)
    ) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
});
