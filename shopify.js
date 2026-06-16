import fetch from 'node-fetch';

const BASE = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2026-04`;

async function shopifyRequest(method, path, body) {
  const headers = {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getPages() {
  const data = await shopifyRequest('GET', '/pages.json?limit=50');
  return data.pages;
}

export async function getPage(id) {
  const data = await shopifyRequest('GET', `/pages/${id}.json`);
  return data.page;
}

export async function updatePage(id, fields) {
  const data = await shopifyRequest('PUT', `/pages/${id}.json`, { page: fields });
  return data.page;
}

export async function getBlogPosts() {
  const blogsData = await shopifyRequest('GET', '/blogs.json');
  const blogs = blogsData.blogs;
  const allArticles = [];
  for (const blog of blogs) {
    const artData = await shopifyRequest('GET', `/blogs/${blog.id}/articles.json?limit=20`);
    allArticles.push(...artData.articles.map(a => ({ ...a, blog_title: blog.title })));
  }
  return allArticles;
}

export async function getArticle(blogId, articleId) {
  const data = await shopifyRequest('GET', `/blogs/${blogId}/articles/${articleId}.json`);
  return data.article;
}

export async function updateArticle(blogId, articleId, fields) {
  const data = await shopifyRequest('PUT', `/blogs/${blogId}/articles/${articleId}.json`, { article: fields });
  return data.article;
}

export async function getProducts(limit = 20) {
  const data = await shopifyRequest('GET', `/products.json?limit=${limit}`);
  return data.products;
}

export async function updateProduct(id, fields) {
  const data = await shopifyRequest('PUT', `/products/${id}.json`, { product: fields });
  return data.product;
}
