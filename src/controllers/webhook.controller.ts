import { Request, Response } from 'express';
import { config } from '../config/env';
import { webhookService } from '../services/webhook.service';

export class WebhookController {
  /**
   * GET /webhook
   * Meta WhatsApp Webhook Handshake Verification
   */
  public verifyWebhook = (req: Request, res: Response): void => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log(`[WEBHOOK_VERIFY] Received handshake verification request:`, {
      mode,
      token,
      challenge,
    });

    if (mode && token) {
      if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
        console.log(`[WEBHOOK_VERIFY] Webhook verification succeeded!`);
        res.status(200).send(challenge);
        return;
      } else {
        console.warn(`[WEBHOOK_VERIFY] Verification token mismatch! Expected: "${config.whatsapp.verifyToken}", Received: "${token}"`);
        res.sendStatus(403);
        return;
      }
    }

    res.sendStatus(400);
  };

  /**
   * POST /webhook
   * Inbound WhatsApp Webhook Event Handler
   */
  public handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = req.body;

      if (!payload || !payload.object) {
        res.sendStatus(404);
        return;
      }

      // Meta expects an immediate 200 OK acknowledgment to prevent repeated retries
      res.status(200).send('EVENT_RECEIVED');

      // Process message asynchronously
      await webhookService.handleWebhookPayload(payload);
    } catch (error) {
      console.error(`[WEBHOOK_CONTROLLER] Error processing webhook event:`, error);
      // We already returned 200 to Meta, log internal issue
    }
  };
}

export const webhookController = new WebhookController();
