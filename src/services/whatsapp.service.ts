import axios, { AxiosError } from 'axios';
import { config } from '../config/env';
import {
  SendTextMessageParams,
  WhatsAppSendMessageResponse,
} from '../types/whatsapp.types';

export class WhatsAppClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly phoneNumberId: string;

  constructor(phoneNumberId?: string, token?: string) {
    this.token = token || config.whatsapp.token;
    this.phoneNumberId = phoneNumberId || config.whatsapp.phoneNumberId;
    this.baseUrl = `${config.whatsapp.graphApiBaseUrl}/${config.whatsapp.apiVersion}/${this.phoneNumberId}/messages`;
  }

  /**
   * Send a standard text message back to a WhatsApp user
   */
  public async sendTextMessage(
    params: SendTextMessageParams
  ): Promise<WhatsAppSendMessageResponse> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'text',
      text: {
        preview_url: Boolean(params.previewUrl),
        body: params.text,
      },
    };

    try {
      console.log(`[WHATSAPP_CLIENT] Sending message to ${params.to}: "${params.text}"`);

      // Mock/Stand-in interception if in local dev with stand-in token
      if (
        !this.token ||
        this.token.startsWith('EAAG_STANDIN') ||
        this.phoneNumberId.startsWith('10000000000000')
      ) {
        console.warn(
          `[WHATSAPP_CLIENT] [MOCK MODE] Stand-in credentials detected. Simulating Meta API response.`
        );
        return {
          messaging_product: 'whatsapp',
          contacts: [{ input: params.to, wa_id: params.to }],
          messages: [{ id: `mock_wamid_${Date.now()}_${Math.random().toString(36).substring(7)}` }],
        };
      }

      const response = await axios.post<WhatsAppSendMessageResponse>(
        this.baseUrl,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      console.log(
        `[WHATSAPP_CLIENT] Message sent successfully. Meta response ID:`,
        response.data.messages?.[0]?.id
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosErr = error as AxiosError<any>;
        console.error(`[WHATSAPP_CLIENT_ERROR] Failed to send message:`, {
          status: axiosErr.response?.status,
          data: axiosErr.response?.data,
          message: axiosErr.message,
        });
      } else {
        console.error(`[WHATSAPP_CLIENT_ERROR] Unexpected error sending message:`, error);
      }
      throw error;
    }
  }
}

export const whatsAppClient = new WhatsAppClient();
