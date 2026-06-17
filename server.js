import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';
import fs from 'fs';
import { runAgent } from './agent.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const pendingChanges = [];
const conversationHistory = [];
const TOKEN_FILE = '/tmp/shopify_token.txt';

function loadToken() {
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return null; }
}
function saveToken(token) {
  fs.writeFileSync(TOKEN_FILE, token);
}

let accessToken = loadToken() || process.env.SHOPIFY_ACCESS_TOKEN || null;

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const STORE = process.env.SHOPIFY_STORE_DOMAIN;
const APP_URL = process.env.APP_URL || 'https://shopify-production-8ccd.up.railway.app';
const REDIRECT_URI = `${APP_URL}/auth/callback`;

// OAuth step 1: redirect to Shopify
app.get('/auth', (req, res) => {
  const scopes = 'read_content,write_content,read_products,write_products';
  const state = crypto.randomBytes(16).toString('hex');
  const url = `https://${STORE}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;
  res.redirect(url);
});

// OAuth step 2: exchange code for token
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    const tokenRes = await fetch(`https://${STORE}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: SHOPIFY_API_KEY, client_secret: SHOPIFY_API_SECRET, code }),
    });
    const data = await tokenRes.json();
    if (data.access_token) {
      accessToken = data.access_token;
      saveToken(accessToken);
      res.redirect('/');
    } else {
      res.status(400).send(`Auth failed: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/auth-status', (req, res) => {
  res.json({ authenticated: !!accessToken });
});

app.post('/api/chat', async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: 'Not connected to Shopify. Please click Connect below.' });
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const { reply, updatedHistory } = await runAgent(message, conversationHistory, pendingChanges, accessToken);
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
    const shopify = await import('./shopify.js');
    if (change.type === 'page') await shopify.updatePage(change.resourceId, change.proposed, accessToken);
    else if (change.type === 'article') await shopify.updateArticle(change.blogId, change.resourceId, change.proposed, accessToken);
    else if (change.type === 'product') await shopify.updateProduct(change.resourceId, change.proposed, accessToken);
    change.status = 'approved';
    change.processedAt = new Date().toISOString();
    res.json({ success: true });
  } catch (err) {
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
