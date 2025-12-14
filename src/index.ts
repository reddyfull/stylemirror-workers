/**
 * StyleMirror API Gateway - Cloudflare Worker
 * 
 * Proxies requests to external APIs while protecting API keys
 * Routes:
 *   /api/search      → SerpAPI Google Shopping
 *   /api/vision      → OpenRouter (GPT-4o Vision)
 *   /api/perplexity  → Perplexity API
 *   /api/n8n/*       → n8n Webhooks (rate limited)
 */

export interface Env {
  SERPAPI_KEY: string;
  OPENROUTER_KEY: string;
  PERPLEXITY_KEY: string;
  N8N_BASE_URL: string;
  ALLOWED_ORIGINS: string;
  RATE_LIMIT_KV: KVNamespace;
}

// Rate limiting config
const RATE_LIMITS = {
  search: { requests: 100, window: 3600 },    // 100 req/hour
  vision: { requests: 50, window: 3600 },     // 50 req/hour
  n8n: { requests: 200, window: 3600 },       // 200 req/hour
};

// CORS headers
function corsHeaders(origin: string, allowedOrigins: string): HeadersInit {
  const allowed = allowedOrigins.split(',').map(o => o.trim());
  const isAllowed = allowed.includes('*') || allowed.includes(origin);
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-ID',
    'Access-Control-Max-Age': '86400',
  };
}

// Rate limiter using KV
async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: { requests: number; window: number }
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `${key}:${Math.floor(now / limit.window)}`;
  
  const current = parseInt(await kv.get(windowKey) || '0');
  
  if (current >= limit.requests) {
    return { allowed: false, remaining: 0 };
  }
  
  await kv.put(windowKey, String(current + 1), { expirationTtl: limit.window });
  return { allowed: true, remaining: limit.requests - current - 1 };
}

// Get client identifier for rate limiting
function getClientId(request: Request): string {
  return request.headers.get('X-User-ID') || 
         request.headers.get('CF-Connecting-IP') || 
         'anonymous';
}

// SerpAPI Google Shopping proxy
async function handleSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  
  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const serpUrl = new URL('https://serpapi.com/search.json');
  serpUrl.searchParams.set('engine', 'google_shopping');
  serpUrl.searchParams.set('q', query);
  serpUrl.searchParams.set('api_key', env.SERPAPI_KEY);
  serpUrl.searchParams.set('gl', url.searchParams.get('gl') || 'us');
  serpUrl.searchParams.set('hl', url.searchParams.get('hl') || 'en');
  serpUrl.searchParams.set('num', url.searchParams.get('num') || '10');
  
  const response = await fetch(serpUrl.toString());
  const data = await response.json();
  
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// OpenRouter Vision proxy
async function handleVision(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const body = await request.json() as {
    image: string;
    prompt?: string;
    model?: string;
  };
  
  if (!body.image) {
    return new Response(JSON.stringify({ error: 'Missing image' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const openRouterPayload = {
    model: body.model || 'openai/gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a fashion and product identification expert. Analyze images to identify products for shopping. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: body.prompt || 'Identify all products in this image. Return JSON with: searchType ("single" or "outfit"), items array with category, description, searchQuery, color, style, brand, estimatedPriceRange.',
          },
          {
            type: 'image_url',
            image_url: {
              url: body.image.startsWith('data:') ? body.image : `data:image/jpeg;base64,${body.image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 1500,
    temperature: 0.2,
  };
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://stylemirror.app',
      'X-Title': 'StyleMirror Vision',
    },
    body: JSON.stringify(openRouterPayload),
  });
  
  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// Perplexity proxy
async function handlePerplexity(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const body = await request.json() as {
    query: string;
    model?: string;
  };
  
  if (!body.query) {
    return new Response(JSON.stringify({ error: 'Missing query' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const perplexityPayload = {
    model: body.model || 'sonar-pro',
    messages: [
      {
        role: 'system',
        content: 'You are a smart shopping assistant. Find the best products and prices. Respond with valid JSON only.',
      },
      {
        role: 'user',
        content: body.query,
      },
    ],
    max_tokens: 2000,
    temperature: 0.2,
  };
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.PERPLEXITY_KEY}`,
    },
    body: JSON.stringify(perplexityPayload),
  });
  
  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// n8n webhook proxy
async function handleN8n(request: Request, env: Env, path: string): Promise<Response> {
  const n8nUrl = `${env.N8N_BASE_URL}${path}`;
  
  const headers: HeadersInit = {
    'Content-Type': request.headers.get('Content-Type') || 'application/json',
  };
  
  // Forward authorization if present
  const auth = request.headers.get('Authorization');
  if (auth) {
    headers['Authorization'] = auth;
  }
  
  const response = await fetch(n8nUrl, {
    method: request.method,
    headers,
    body: request.method !== 'GET' ? await request.text() : undefined,
  });
  
  const data = await response.text();
  
  return new Response(data, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    },
  });
}

// Health check
function handleHealth(): Response {
  return new Response(JSON.stringify({
    status: 'ok',
    service: 'stylemirror-api-gateway',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// Main request handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(origin, env.ALLOWED_ORIGINS),
      });
    }
    
    // Get client ID for rate limiting
    const clientId = getClientId(request);
    
    try {
      let response: Response;
      
      // Route requests
      if (path === '/health' || path === '/') {
        response = handleHealth();
      } else if (path === '/api/search') {
        // Rate limit check
        const rateCheck = await checkRateLimit(env.RATE_LIMIT_KV, `search:${clientId}`, RATE_LIMITS.search);
        if (!rateCheck.allowed) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: {
              ...corsHeaders(origin, env.ALLOWED_ORIGINS),
              'Content-Type': 'application/json',
              'X-RateLimit-Remaining': '0',
            },
          });
        }
        response = await handleSearch(request, env);
      } else if (path === '/api/vision') {
        const rateCheck = await checkRateLimit(env.RATE_LIMIT_KV, `vision:${clientId}`, RATE_LIMITS.vision);
        if (!rateCheck.allowed) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: {
              ...corsHeaders(origin, env.ALLOWED_ORIGINS),
              'Content-Type': 'application/json',
            },
          });
        }
        response = await handleVision(request, env);
      } else if (path === '/api/perplexity') {
        const rateCheck = await checkRateLimit(env.RATE_LIMIT_KV, `search:${clientId}`, RATE_LIMITS.search);
        if (!rateCheck.allowed) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: {
              ...corsHeaders(origin, env.ALLOWED_ORIGINS),
              'Content-Type': 'application/json',
            },
          });
        }
        response = await handlePerplexity(request, env);
      } else if (path.startsWith('/api/n8n/')) {
        const rateCheck = await checkRateLimit(env.RATE_LIMIT_KV, `n8n:${clientId}`, RATE_LIMITS.n8n);
        if (!rateCheck.allowed) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: {
              ...corsHeaders(origin, env.ALLOWED_ORIGINS),
              'Content-Type': 'application/json',
            },
          });
        }
        const n8nPath = path.replace('/api/n8n', '/webhook');
        response = await handleN8n(request, env, n8nPath);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      // Add CORS headers to response
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders(origin, env.ALLOWED_ORIGINS)).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });
      
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 500,
        headers: {
          ...corsHeaders(origin, env.ALLOWED_ORIGINS),
          'Content-Type': 'application/json',
        },
      });
    }
  },
};
