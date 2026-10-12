import express, { Application } from 'express';
import cors from 'cors';
import { healthRoutes } from './routes/health.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { faqRoutes } from './routes/faq.routes';
import { errorHandler } from './middlewares/errorHandler';

export const createApp = (): Application => {
  const app = express();

  // Core middlewares
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.use('/api', healthRoutes);
  app.use('/api', faqRoutes);
  app.use(webhookRoutes); // Root level /webhook as standard for Meta Cloud API

  // Global Error Handler
  app.use(errorHandler);

  return app;
};
