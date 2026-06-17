import Anthropic from '@anthropic-ai/sdk';
import * as shopify from './shopify.js';

const client = new Anthropic();

const tools = [
  {
    name: 'list_pages',
    description: 'List all pages in the Shopify store',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_page',
    description: 'Get the full content of a specific page by ID',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Page ID' } },
      required: ['id'],
    },
  },
  {
    name: 'propose_page_update',
    description: 'Propose an update to a page (requires user approval before applying)',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Page ID' },
        title: { type: 'string', description: 'New page title (optional)' },
        body_html: { type: 'string', description: 'New page HTML content (optional)' },
        reason: { type: 'string', description: 'Explanation of what changed and why' },
      },
      required: ['id', 'reason'],
    },
  },
  {
    name: 'list_blog_posts',
    description: 'List all blog posts across all blogs',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_blog_post',
    description: 'Get the full content of a specific blog post',
    input_schema: {
      type: 'object',
      properties: {
        blog_id: { type: 'number', description: 'Blog ID' },
        article_id: { type: 'number', description: 'Article ID' },
      },
      required: ['blog_id', 'article_id'],
    },
  },
  {
    name: 'propose_blog_post_update',
    description: 'Propose an update to a blog post (requires user approval before applying)',
    input_schema: {
      type: 'object',
      properties: {
        blog_id: { type: 'number', description: 'Blog ID' },
        article_id: { type: 'number', description: 'Article ID' },
        title: { type: 'string', description: 'New title (optional)' },
        body_html: { type: 'string', description: 'New HTML content (optional)' },
        reason: { type: 'string', description: 'Explanation of what changed and why' },
      },
      required: ['blog_id', 'article_id', 'reason'],
    },
  },
  {
    name: 'list_products',
    description: 'List products in the store',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'propose_product_update',
    description: 'Propose an update to a product description (requires user approval before applying)',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Product ID' },
        title: { type: 'string', description: 'New product title (optional)' },
        body_html: { type: 'string', description: 'New product description HTML (optional)' },
        reason: { type: 'string', description: 'Explanation of what changed and why' },
      },
      required: ['id', 'reason'],
    },
  },
];

async function executeTool(name, input, pendingChanges, token) {
  switch (name) {
    case 'list_pages': {
      const pages = await shopify.getPages(token);
      return pages.map(p => ({ id: p.id, title: p.title, handle: p.handle }));
    }
    case 'get_page': {
      return shopify.getPage(input.id, token);
    }
    case 'propose_page_update': {
      const current = await shopify.getPage(input.id, token);
      const change = {
        id: `page_${input.id}_${Date.now()}`,
        type: 'page',
        resourceId: input.id,
        current: { title: current.title, body_html: current.body_html },
        proposed: { title: input.title || current.title, body_html: input.body_html || current.body_html },
        reason: input.reason,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      pendingChanges.push(change);
      return { changeId: change.id, message: 'Change queued for your approval.' };
    }
    case 'list_blog_posts': {
      const posts = await shopify.getBlogPosts(token);
      return posts.map(p => ({ blog_id: p.blog_id, article_id: p.id, title: p.title, blog: p.blog_title }));
    }
    case 'get_blog_post': {
      return shopify.getArticle(input.blog_id, input.article_id, token);
    }
    case 'propose_blog_post_update': {
      const current = await shopify.getArticle(input.blog_id, input.article_id, token);
      const change = {
        id: `article_${input.article_id}_${Date.now()}`,
        type: 'article',
        blogId: input.blog_id,
        resourceId: input.article_id,
        current: { title: current.title, body_html: current.body_html },
        proposed: { title: input.title || current.title, body_html: input.body_html || current.body_html },
        reason: input.reason,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      pendingChanges.push(change);
      return { changeId: change.id, message: 'Change queued for your approval.' };
    }
    case 'list_products': {
      const products = await shopify.getProducts(20, token);
      return products.map(p => ({ id: p.id, title: p.title, status: p.status }));
    }
    case 'propose_product_update': {
      const products = await shopify.getProducts(250, token);
      const current = products.find(p => p.id === input.id);
      if (!current) throw new Error(`Product ${input.id} not found`);
      const change = {
        id: `product_${input.id}_${Date.now()}`,
        type: 'product',
        resourceId: input.id,
        current: { title: current.title, body_html: current.body_html },
        proposed: { title: input.title || current.title, body_html: input.body_html || current.body_html },
        reason: input.reason,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      pendingChanges.push(change);
      return { changeId: change.id, message: 'Change queued for your approval.' };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function runAgent(userMessage, conversationHistory, pendingChanges, token) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const systemPrompt = `You are a helpful AI assistant managing content for a Shopify store (nudispray.com).
You can read pages, blog posts, and products, and propose changes to them.
IMPORTANT: You never apply changes directly. You always use the "propose_*" tools to queue changes for the store owner's approval.
Be concise and helpful. When proposing changes, explain clearly what you changed and why.`;

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    tools,
    messages,
  });

  const assistantMessages = [];

  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter(b => b.type === 'tool_use');
    const toolResults = [];

    for (const toolUse of toolUses) {
      let result;
      try {
        result = await executeTool(toolUse.name, toolUse.input, pendingChanges, token);
      } catch (err) {
        result = { error: err.message };
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });
  }

  const textContent = response.content.find(b => b.type === 'text');
  const replyText = textContent ? textContent.text : 'Done.';

  return { reply: replyText, updatedHistory: messages };
}
