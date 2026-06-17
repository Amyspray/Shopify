import fetch from 'node-fetch';

const BASE = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2026-04`;

async function shopifyRequest(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getPages(token) {
  const data = await shopifyRequest('GET', '/pages.json?limit=50', token);
  return data.pages;
}

export async function getPage(id, token) {
  const data = await shopifyRequest('GET', `/pages/${id}.json`, token);
  return data.page;
}

export async function updatePage(id, fields, token) {
  const data = await shopifyRequest('PUT', `/pages/${id}.json`, token, { page: fields });
  return data.page;
}

export async function getBlogPosts(token) {
  const blogsData = await shopifyRequest('GET', '/blogs.json', token);
  const blogs = blogsData.blogs;
  const allArticles = [];
  for (const blog of blogs) {
    const artData = await shopifyRequest('GET', `/blogs/${blog.id}/articles.json?limit=10`, token);
    allArticles.push(...artData.articles.map(a => ({ ...a, blog_title: blog.title })));
  }
  return allArticles;
}

export async function getArticle(blogId, articleId, token) {
  const data = await shopifyRequest('GET', `/blogs/${blogId}/articles/${articleId}.json`, token);
  return data.article;
}

export async function updateArticle(blogId, articleId, fields, token) {
  const data = await shopifyRequest('PUT', `/blogs/${blogId}/articles/${articleId}.json`, token, { article: fields });
  return data.article;
}

export async function getProducts(limit = 20, token) {
  const data = await shopifyRequest('GET', `/products.json?limit=${limit}`, token);
  return data.products;
}

export async function updateProduct(id, fields, token) {
  const data = await shopifyRequest('PUT', `/products/${id}.json`, token, { product: fields });
  return data.product;
}
