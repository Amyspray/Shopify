import 'dotenv/config';
import express from 'express';
import { runAgent } from './agent.js';
import * as shopify from './shopify.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const pendingChanges = [];
const conversationHistory = [];

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    const { reply, updatedHistory } = await runAgent(message, conversationHistory, pendingChanges);
    conversationHistory.length = 0;
    conversationHistory.push(...updatedHistory.slice(-20));
    res.json({ reply, pendingCount: pendingChanges.filter(c => c.status === 'pending').length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/changes', (req, res) => {
  res.json(pendingChanges);
});

app.post('/api/changes/:id/approve', async (req, res) => {
  const change = pendingChanges.find(c => c.id === req.params.id);
  if (!change) return res.status(404).json({ error: 'Change not found' });
  if (change.status !== 'pending') return res.status(400).json({ error: 'Change already processed' });

  try {
    if (change.type === 'page') {
      await shopify.updatePage(change.resourceId, change.proposed);
    } else if (change.type === 'article') {
      await shopify.updateArticle(change.blogId, change.resourceId, change.proposed);
    } else if (change.type === 'product') {
      await shopify.updateProduct(change.resourceId, change.proposed);
    }
    change.status = 'approved';
    change.processedAt = new Date().toISOString();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/changes/:id/reject', (req, res) => {
  const change = pendingChanges.find(c => c.id === req.params.id);
  if (!change) return res.status(404).json({ error: 'Change not found' });
  change.status = 'rejected';
  change.processedAt = new Date().toISOString();
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Agent running at http://localhost:${PORT}`));
