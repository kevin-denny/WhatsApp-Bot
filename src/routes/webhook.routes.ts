import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

export const webhookRoutes = Router();

// Meta verification handshake
webhookRoutes.get('/webhook', webhookController.verifyWebhook);

// Inbound WhatsApp events
webhookRoutes.post('/webhook', webhookController.handleWebhook);
