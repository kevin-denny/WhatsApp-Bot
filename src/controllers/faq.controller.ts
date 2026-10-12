import { Request, Response } from 'express';
import { faqService } from '../services/faq.service';
import { config } from '../config/env';

export class FaqController {
  public listFaqs = async (req: Request, res: Response): Promise<void> => {
    try {
      const businessId = (req.query.businessId as string) || config.defaultBusinessId || 'standin_default_business_id';
      const faqs = await faqService.listFaqs(businessId);
      res.status(200).json({ success: true, data: faqs });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

  public createFaq = async (req: Request, res: Response): Promise<void> => {
    try {
      const { question, answer, keywords, category, priority } = req.body;
      const businessId = (req.body.businessId as string) || config.defaultBusinessId || 'standin_default_business_id';

      if (!question || !answer) {
        res.status(400).json({ success: false, error: 'Question and answer are required' });
        return;
      }

      const newFaq = await faqService.createFaq(businessId, {
        question,
        answer,
        keywords,
        category,
        priority,
      });

      res.status(201).json({ success: true, data: newFaq });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

  public testMatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const { query } = req.body;
      const businessId = (req.body.businessId as string) || config.defaultBusinessId || 'standin_default_business_id';

      if (!query) {
        res.status(400).json({ success: false, error: 'Query string is required' });
        return;
      }

      const match = await faqService.matchQuery(businessId, query);
      res.status(200).json({ success: true, data: match });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  };
}

export const faqController = new FaqController();
