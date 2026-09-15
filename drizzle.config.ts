import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/servidor/db/schema.ts',
  out: './src/servidor/db/migraciones',
});
