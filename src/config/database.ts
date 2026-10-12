import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { config } from '../config/env';

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Configure Prisma 7 driver adapter
const adapter = new PrismaPg(pool);

// Instantiate single PrismaClient instance for application
export const prisma = new PrismaClient({ adapter });

export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log('[DATABASE] PostgreSQL connected successfully via Prisma');
  } catch (error) {
    console.error('[DATABASE] Failed to connect to PostgreSQL:', error);
  }
};
