import 'dotenv/config';

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://cafeteria:cafeteria@127.0.0.1:5433/cafeteria',
  puerto: Number(process.env.PUERTO ?? 3000),
  carpetaFotos: process.env.CARPETA_FOTOS ?? 'fotos',
};
