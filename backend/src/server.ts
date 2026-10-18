import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.info(`Backend escuchando en el puerto ${env.port}`);
});
