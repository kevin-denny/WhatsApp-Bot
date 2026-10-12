import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

async function runFaqTests() {
  console.log('=== TEST SUITE: FAQ ENGINE & INBOUND AUTOMATION ===\n');

  // 1. List FAQs API
  console.log('1. Listing configured FAQs via API:');
  const faqsRes = await axios.get(`${BASE_URL}/api/faqs`);
  console.log(`Fetched ${faqsRes.data.data.length} FAQs:`);
  faqsRes.data.data.forEach((faq: any) => console.log(` - [${faq.category}] Q: "${faq.question}"`));

  // 2. Direct Query Matching Test
  console.log('\n2. Testing query matching engine:');
  const testQueries = [
    'What time are you open?',
    'Where is your Colombo office?',
    'What is your pricing?',
    'Can I talk to a human agent please?',
    'Can you help me fix my broken spaceship?', // Expected fallback
  ];

  for (const q of testQueries) {
    const matchRes = await axios.post(`${BASE_URL}/api/faqs/match`, { query: q });
    const { matched, confidence, score, reply } = matchRes.data.data;
    console.log(`Query: "${q}"`);
    console.log(` -> Matched: ${matched} | Confidence: ${confidence} | Score: ${score}`);
    console.log(` -> Reply: "${reply}"\n`);
  }

  // 3. Simulated Inbound WhatsApp Message with FAQ Matching
  console.log('3. Simulating WhatsApp Inbound Message with FAQ trigger:');
  const inboundPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '100000000000002',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+15550000001',
                phone_number_id: '100000000000001',
              },
              contacts: [
                {
                  profile: { name: 'Bob Customer' },
                  wa_id: '94779876543',
                },
              ],
              messages: [
                {
                  from: '94779876543',
                  id: `wamid.FAQ_TEST_${Date.now()}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: {
                    body: 'What are your working hours and opening times?',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const webhookRes = await axios.post(`${BASE_URL}/webhook`, inboundPayload);
  console.log('Webhook Inbound Status:', webhookRes.status, webhookRes.data);
}

runFaqTests().catch(console.error);
