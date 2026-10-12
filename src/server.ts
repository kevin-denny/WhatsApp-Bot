import { createApp } from './app';
import { config } from './config/env';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[SERVER] WhatsApp Bot backend running on port ${config.port} in ${config.nodeEnv} mode`);
  console.log(`[SERVER] Health check available at: http://localhost:${config.port}/api/health`);
});
