import { Router, Request, Response } from 'express';

export const healthRoutes = Router();

healthRoutes.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'WhatsApp FAQ Automation Platform',
  });
});
