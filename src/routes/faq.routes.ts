import { Router } from 'express';
import { faqController } from '../controllers/faq.controller';

export const faqRoutes = Router();

faqRoutes.get('/faqs', faqController.listFaqs);
faqRoutes.post('/faqs', faqController.createFaq);
faqRoutes.post('/faqs/match', faqController.testMatch);
