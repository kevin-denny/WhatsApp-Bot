import { prisma } from '../config/database';

export interface FAQItem {
  id: string;
  businessId: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchResult {
  matched: boolean;
  faq?: FAQItem;
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  reply: string;
}

// In-memory seed FAQ store for standalone testing / offline fallback
const memoryFaqs: Map<string, FAQItem[]> = new Map();

export class FaqService {
  constructor() {
    this.seedDefaultFaqs('standin_default_business_id');
  }

  private seedDefaultFaqs(businessId: string) {
    if (!memoryFaqs.has(businessId)) {
      memoryFaqs.set(businessId, [
        {
          id: 'faq_hours_1',
          businessId,
          question: 'What are your opening hours?',
          answer: 'We are open Monday to Saturday from 9:00 AM to 6:00 PM. Closed on Sundays.',
          keywords: ['hours', 'open', 'opening', 'time', 'timing', 'working hours', 'close'],
          category: 'Hours & Location',
          priority: 10,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'faq_loc_2',
          businessId,
          question: 'Where are you located?',
          answer: 'Our main office is located at 123 Colombo Road, Colombo, Sri Lanka.',
          keywords: ['location', 'address', 'where', 'located', 'place', 'map', 'directions'],
          category: 'Hours & Location',
          priority: 10,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'faq_price_3',
          businessId,
          question: 'How much do your services cost?',
          answer: 'Our packages start from $50/month. We offer customizable tiers depending on your WhatsApp message volume.',
          keywords: ['price', 'pricing', 'cost', 'fee', 'package', 'rate', 'how much'],
          category: 'Pricing',
          priority: 8,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'faq_support_4',
          businessId,
          question: 'Can I speak with a human agent?',
          answer: 'Certainly! Type "agent" or "human" at any time and one of our customer support representatives will assist you.',
          keywords: ['human', 'agent', 'support', 'person', 'representative', 'operator', 'talk to human'],
          category: 'Support',
          priority: 15,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }
  }

  /**
   * Get all active FAQs for a specific tenant business
   */
  public async getActiveFaqs(businessId: string): Promise<FAQItem[]> {
    try {
      const faqs = await prisma.fAQ.findMany({
        where: {
          businessId,
          active: true,
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      });

      if (faqs.length > 0) {
        return faqs as FAQItem[];
      }
    } catch {
      // Use in-memory fallback
    }

    this.seedDefaultFaqs(businessId);
    return memoryFaqs.get(businessId) || [];
  }

  /**
   * Match an incoming customer query against business FAQs
   */
  public async matchQuery(businessId: string, queryText: string): Promise<MatchResult> {
    const cleanedQuery = queryText.toLowerCase().trim();
    const queryTokens = cleanedQuery
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 1);

    const faqs = await this.getActiveFaqs(businessId);

    let bestMatch: FAQItem | null = null;
    let highestScore = 0;

    for (const faq of faqs) {
      let score = 0;
      const lowerQuestion = faq.question.toLowerCase();

      // 1. Exact or substring match in question
      if (cleanedQuery === lowerQuestion) {
        score += 100;
      } else if (cleanedQuery.includes(lowerQuestion) || lowerQuestion.includes(cleanedQuery)) {
        score += 50;
      }

      // 2. Keyword exact and token matches
      for (const kw of faq.keywords) {
        const lowerKw = kw.toLowerCase().trim();
        if (cleanedQuery.includes(lowerKw)) {
          score += 25;
        } else {
          for (const token of queryTokens) {
            if (token === lowerKw) {
              score += 15;
            } else if (token.length > 3 && lowerKw.includes(token)) {
              score += 8;
            }
          }
        }
      }

      // Add small priority weight
      score += faq.priority * 0.5;

      if (score > highestScore) {
        highestScore = score;
        bestMatch = faq;
      }
    }

    // Threshold evaluation
    if (bestMatch && highestScore >= 20) {
      const confidence = highestScore >= 50 ? 'HIGH' : 'MEDIUM';
      return {
        matched: true,
        faq: bestMatch,
        score: highestScore,
        confidence,
        reply: bestMatch.answer,
      };
    }

    // Safe fallback message when question is unknown
    const fallbackReply =
      "I'm sorry, I couldn't find an exact answer to your question in our knowledge base. Would you like me to connect you with a human support agent?";

    return {
      matched: false,
      score: highestScore,
      confidence: highestScore > 0 ? 'LOW' : 'NONE',
      reply: fallbackReply,
    };
  }

  /**
   * Create a new FAQ for a business
   */
  public async createFaq(businessId: string, data: {
    question: string;
    answer: string;
    keywords?: string[];
    category?: string;
    priority?: number;
  }): Promise<FAQItem> {
    try {
      const created = await prisma.fAQ.create({
        data: {
          businessId,
          question: data.question,
          answer: data.answer,
          keywords: data.keywords || [],
          category: data.category || 'General',
          priority: data.priority ?? 0,
          active: true,
        },
      });
      return created as FAQItem;
    } catch {
      this.seedDefaultFaqs(businessId);
      const newFaq: FAQItem = {
        id: `faq_${Date.now()}`,
        businessId,
        question: data.question,
        answer: data.answer,
        keywords: data.keywords || [],
        category: data.category || 'General',
        priority: data.priority ?? 0,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const list = memoryFaqs.get(businessId) || [];
      list.push(newFaq);
      memoryFaqs.set(businessId, list);
      return newFaq;
    }
  }

  /**
   * List all FAQs for a business
   */
  public async listFaqs(businessId: string): Promise<FAQItem[]> {
    try {
      const items = await prisma.fAQ.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
      });
      return items as FAQItem[];
    } catch {
      this.seedDefaultFaqs(businessId);
      return memoryFaqs.get(businessId) || [];
    }
  }
}

export const faqService = new FaqService();
