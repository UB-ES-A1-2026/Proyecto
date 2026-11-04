// Generado con asistencia de IA – revisado por Danyal, 18/10/2026
import express from 'express';
import { apiRoutes } from './routes/index.js';
import { corsMiddleware } from './middlewares/corsMiddleware.js';
import { errorMiddleware } from './middlewares/errorMiddleware.js';
import { notFoundMiddleware } from './middlewares/notFoundMiddleware.js';

export const app = express();

app.use(corsMiddleware);
app.use(express.json());
app.use('/api', apiRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);
