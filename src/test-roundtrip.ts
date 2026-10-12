import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const VERIFY_TOKEN = 'my_whatsapp_webhook_verify_token_secure_123';

async function runVerificationTests() {
  console.log('--- TEST 1: Health Check Endpoint ---');
  try {
    const res = await axios.get(`${BASE_URL}/api/health`);
    console.log('Health check status:', res.status, res.data);
  } catch (err: any) {
    console.error('Health check failed:', err.message);
  }

  console.log('\n--- TEST 2: Valid Webhook Verification Handshake (GET /webhook) ---');
  try {
    const challenge = 'test_challenge_code_987654';
    const res = await axios.get(`${BASE_URL}/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': challenge,
      },
    });
    console.log('Verification handshake status:', res.status, 'Response body:', res.data);
    if (res.data.toString() === challenge) {
      console.log(' Verification handshake test passed!');
    }
  } catch (err: any) {
    console.error('Handshake test failed:', err.message);
  }

  console.log('\n--- TEST 3: Invalid Webhook Verification Handshake (Wrong Token) ---');
  try {
    await axios.get(`${BASE_URL}/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': '1234',
      },
    });
    console.error('Expected 403 Forbidden, but received success!');
  } catch (err: any) {
    console.log('Invalid handshake correctly rejected with HTTP status:', err.response?.status);
  }

  console.log('\n--- TEST 4: Inbound WhatsApp Message Simulation (POST /webhook) ---');
  try {
    const mockPayload = {
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
                    profile: { name: 'Alice Customer' },
                    wa_id: '94771234567',
                  },
                ],
                messages: [
                  {
                    from: '94771234567',
                    id: `wamid.HBgLOTE3NzEyMzQ1NjcVAgARGBIzQkRFNzUyQjFDOTkzQUJDRAA_${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: {
                      body: 'What are your opening hours?',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const res = await axios.post(`${BASE_URL}/webhook`, mockPayload);
    console.log('Inbound message webhook response status:', res.status, 'Body:', res.data);
  } catch (err: any) {
    console.error('Inbound message test failed:', err.message);
  }
}

runVerificationTests();
