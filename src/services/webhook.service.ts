import { prisma } from '../config/database';
import { whatsAppClient } from './whatsapp.service';
import { faqService } from './faq.service';
import { config } from '../config/env';
import { WhatsAppWebhookPayload } from '../types/whatsapp.types';
import { ConversationMode, MessageDirection } from '../generated/prisma/enums';

export interface InboundMessageResult {
  businessId: string;
  customerId: string;
  conversationId: string;
  inboundMessageId: string;
  wamId?: string;
  replySent: boolean;
  replyMessage?: string;
}

// In-memory fallback repository when live PostgreSQL instance is not yet running
const memoryStore = {
  businesses: new Map<string, any>(),
  customers: new Map<string, any>(),
  conversations: new Map<string, any>(),
  messages: new Map<string, any>(),
};

export class WebhookService {
  /**
   * Resolves or provisions a tenant Business record
   */
  private async resolveBusiness(phoneMetadata?: { phone_number_id: string; display_phone_number: string }): Promise<string> {
    const defaultBusinessId = config.defaultBusinessId || 'standin_default_business_id';

    try {
      let business = await prisma.business.findUnique({
        where: { id: defaultBusinessId },
      });

      if (!business) {
        business = await prisma.business.create({
          data: {
            id: defaultBusinessId,
            name: 'Demo Business',
            phone: phoneMetadata?.display_phone_number || '+15550000000',
            email: 'admin@demobusiness.com',
            status: 'ACTIVE',
          },
        });
        console.log(`[WEBHOOK_SERVICE] Created initial Business tenant record in DB: ${business.id}`);
      }

      return business.id;
    } catch (dbErr: any) {
      console.warn(`[WEBHOOK_SERVICE] [DB OFFLINE FALLBACK] PostgreSQL unreachable. Using in-memory store. (${dbErr.message})`);
      if (!memoryStore.businesses.has(defaultBusinessId)) {
        memoryStore.businesses.set(defaultBusinessId, {
          id: defaultBusinessId,
          name: 'Demo Business (Stand-in)',
          phone: phoneMetadata?.display_phone_number || '+15550000000',
          email: 'admin@demobusiness.com',
          status: 'ACTIVE',
          createdAt: new Date(),
        });
      }
      return defaultBusinessId;
    }
  }

  /**
   * Resolves or provisions a Customer record scoped to the business tenant
   */
  private async resolveCustomer(businessId: string, customerPhone: string, customerName?: string) {
    try {
      let customer = await prisma.customer.findUnique({
        where: {
          unique_customer_per_business: {
            businessId,
            phoneNumber: customerPhone,
          },
        },
      });

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            businessId,
            phoneNumber: customerPhone,
            name: customerName || null,
            firstSeen: new Date(),
            lastSeen: new Date(),
          },
        });
        console.log(`[WEBHOOK_SERVICE] Created new Customer record in DB: ${customer.id}`);
      } else {
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: {
            lastSeen: new Date(),
            ...(customerName && !customer.name ? { name: customerName } : {}),
          },
        });
      }

      return customer;
    } catch {
      const customerKey = `${businessId}:${customerPhone}`;
      let customer = memoryStore.customers.get(customerKey);
      if (!customer) {
        customer = {
          id: `cust_${customerPhone}_${Date.now()}`,
          businessId,
          phoneNumber: customerPhone,
          name: customerName || null,
          firstSeen: new Date(),
          lastSeen: new Date(),
        };
        memoryStore.customers.set(customerKey, customer);
        console.log(`[WEBHOOK_SERVICE] [FALLBACK STORE] Created Customer: ${customer.id}`);
      } else {
        customer.lastSeen = new Date();
        if (customerName) customer.name = customerName;
      }
      return customer;
    }
  }

  /**
   * Resolves or provisions an active conversation for the customer
   */
  private async resolveConversation(businessId: string, customerId: string) {
    try {
      let conversation = await prisma.conversation.findFirst({
        where: {
          businessId,
          customerId,
          status: 'OPEN',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            businessId,
            customerId,
            status: 'OPEN',
            mode: ConversationMode.BOT,
          },
        });
        console.log(`[WEBHOOK_SERVICE] Created new Conversation in DB: ${conversation.id}`);
      }

      return conversation;
    } catch {
      const convKey = `${businessId}:${customerId}`;
      let conversation = memoryStore.conversations.get(convKey);
      if (!conversation) {
        conversation = {
          id: `conv_${customerId}_${Date.now()}`,
          businessId,
          customerId,
          status: 'OPEN',
          mode: ConversationMode.BOT,
          createdAt: new Date(),
        };
        memoryStore.conversations.set(convKey, conversation);
        console.log(`[WEBHOOK_SERVICE] [FALLBACK STORE] Created Conversation: ${conversation.id}`);
      }
      return conversation;
    }
  }

  /**
   * Process incoming Meta WhatsApp webhook payload
   */
  public async handleWebhookPayload(payload: WhatsAppWebhookPayload): Promise<InboundMessageResult[]> {
    const results: InboundMessageResult[] = [];

    if (!payload.entry || !Array.isArray(payload.entry)) {
      return results;
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        if (value.statuses && !value.messages) {
          console.log(`[WEBHOOK_SERVICE] Received message status update:`, value.statuses.map(s => `${s.id}: ${s.status}`).join(', '));
          continue;
        }

        if (!value.messages || value.messages.length === 0) {
          continue;
        }

        const businessId = await this.resolveBusiness(value.metadata);

        for (const msg of value.messages) {
          const wamId = msg.id;
          const customerPhone = msg.from;
          const contact = value.contacts?.find((c) => c.wa_id === customerPhone);
          const customerName = contact?.profile?.name;

          // Check idempotency
          try {
            const existingMsg = await prisma.message.findUnique({
              where: { wamId },
            });
            if (existingMsg) {
              console.warn(`[WEBHOOK_SERVICE] Duplicate message detected in DB (wamId: ${wamId}). Skipping.`);
              continue;
            }
          } catch {
            if (memoryStore.messages.has(wamId)) {
              console.warn(`[WEBHOOK_SERVICE] [FALLBACK STORE] Duplicate message detected (wamId: ${wamId}). Skipping.`);
              continue;
            }
          }

          // Resolve tenant entities
          const customer = await this.resolveCustomer(businessId, customerPhone, customerName);
          const conversation = await this.resolveConversation(businessId, customer.id);

          // Extract text content
          let messageText = '';
          if (msg.type === 'text' && msg.text) {
            messageText = msg.text.body;
          } else if (msg.type === 'interactive') {
            messageText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Interactive Response]';
          } else {
            messageText = `[Unsupported message type: ${msg.type}]`;
          }

          // 1. Persist inbound customer message
          let savedInboundId = `msg_in_${Date.now()}`;
          try {
            const savedInbound = await prisma.message.create({
              data: {
                businessId,
                conversationId: conversation.id,
                customerId: customer.id,
                direction: MessageDirection.INBOUND,
                message: messageText,
                type: msg.type,
                wamId,
              },
            });
            savedInboundId = savedInbound.id;
          } catch {
            memoryStore.messages.set(wamId, {
              id: savedInboundId,
              businessId,
              conversationId: conversation.id,
              customerId: customer.id,
              direction: MessageDirection.INBOUND,
              message: messageText,
              type: msg.type,
              wamId,
              createdAt: new Date(),
            });
          }

          console.log(
            `[WEBHOOK_SERVICE] Persisted Inbound message: "${messageText}" from ${customerPhone} (wamId: ${wamId})`
          );

          // Check conversation mode: If human has taken over, do not send bot reply
          if (conversation.mode === ConversationMode.HUMAN) {
            console.log(`[WEBHOOK_SERVICE] Conversation ${conversation.id} is in HUMAN mode. Skipping automated bot reply.`);
            results.push({
              businessId,
              customerId: customer.id,
              conversationId: conversation.id,
              inboundMessageId: savedInboundId,
              wamId,
              replySent: false,
              replyMessage: '[HANDOVER_TO_HUMAN]',
            });
            continue;
          }

          // Check if customer explicitly requests human agent handover
          const lowerQuery = messageText.toLowerCase().trim();
          if (['agent', 'human', 'talk to human', 'support agent'].some((trigger) => lowerQuery.includes(trigger))) {
            const handoverText = "I have paused automated responses and notified a human agent to take over. An agent will respond shortly.";
            
            // Switch mode to HUMAN
            try {
              await prisma.conversation.update({
                where: { id: conversation.id },
                data: { mode: ConversationMode.HUMAN },
              });
            } catch {
              conversation.mode = ConversationMode.HUMAN;
            }

            await whatsAppClient.sendTextMessage({
              to: customerPhone,
              text: handoverText,
            });

            results.push({
              businessId,
              customerId: customer.id,
              conversationId: conversation.id,
              inboundMessageId: savedInboundId,
              wamId,
              replySent: true,
              replyMessage: handoverText,
            });
            continue;
          }

          // 2. Query FAQ Knowledge Base
          const matchResult = await faqService.matchQuery(businessId, messageText);
          const replyText = matchResult.reply;

          let replySent = false;
          try {
            const outboundResponse = await whatsAppClient.sendTextMessage({
              to: customerPhone,
              text: replyText,
            });

            const outboundWamId = outboundResponse.messages?.[0]?.id;

            // Persist outbound response
            try {
              await prisma.message.create({
                data: {
                  businessId,
                  conversationId: conversation.id,
                  customerId: customer.id,
                  direction: MessageDirection.OUTBOUND,
                  message: replyText,
                  type: 'text',
                  wamId: outboundWamId || null,
                },
              });
            } catch {
              if (outboundWamId) {
                memoryStore.messages.set(outboundWamId, {
                  id: `msg_out_${Date.now()}`,
                  businessId,
                  conversationId: conversation.id,
                  customerId: customer.id,
                  direction: MessageDirection.OUTBOUND,
                  message: replyText,
                  type: 'text',
                  wamId: outboundWamId,
                  createdAt: new Date(),
                });
              }
            }

            replySent = true;
            console.log(
              `[WEBHOOK_SERVICE] Dispatched FAQ reply (${matchResult.confidence} confidence, score: ${matchResult.score}) to ${customerPhone}`
            );
          } catch (replyError) {
            console.error(`[WEBHOOK_SERVICE] Failed to send outbound FAQ reply:`, replyError);
          }

          results.push({
            businessId,
            customerId: customer.id,
            conversationId: conversation.id,
            inboundMessageId: savedInboundId,
            wamId,
            replySent,
            replyMessage: replyText,
          });
        }
      }
    }

    return results;
  }
}

export const webhookService = new WebhookService();
