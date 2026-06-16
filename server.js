import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { runAgent } from './agent.js';
import * as shopify from './shopify.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const pendingChanges = [];
const conversationHistory = [];

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
const STORE = process.env.SHOPIFY_STORE_DOMAIN;

// OAuth: redirect to Shopify login
app.get('/auth', (req, res) => {
  const scopes = 'read_content,write_content,read_products,write_products';
  const redirectUri = `${APP_URL}/auth/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = `https://${STORE}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  res.redirect(authUrl);
});

// OAuth: handle callback and store token
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  const tokenRes = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: SHOPIFY_API_KEY, client_secret: SHOPIFY_API_SECRET, code }),
  });
  const data = await tokenRes.json();
  if (data.access_token) {
    process.env.SHOPIFY_ACCESS_TOKEN = data.access_token;
    shopify.setToken(data.access_token);
    res.redirect('/');
  } else {
    res.status(400).send(`Auth failed: ${JSON.stringify(data)}`);
  }
});

app.post('/api/chat', async (req, res) => {
  if (!process.env.SHOPIFY_ACCESS_TOKEN) {
    return res.status(401).json({ error: 'Not authenticated. Please visit /auth first.' });
  }
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

app.get('/api/changes', (req, res) => res.json(pendingChanges));

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
