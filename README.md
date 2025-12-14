# StyleMirror API Gateway

Cloudflare Workers-based API Gateway for StyleMirror fashion discovery app.

## Features

- 🔐 **API Key Protection** - Hides SerpAPI, OpenRouter, and Perplexity keys
- ⚡ **Rate Limiting** - Per-user/IP rate limits using Cloudflare KV
- 🌍 **Global Edge** - Deployed to 300+ Cloudflare locations
- 🔄 **n8n Proxy** - Secure proxy to your n8n webhooks
- 📊 **CORS Support** - Configurable allowed origins

## Architecture

```
┌─────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│   Frontend  │────▶│  Cloudflare Worker       │────▶│  External APIs  │
│  (Lovable)  │     │  api.stylemirror.app     │     │  - SerpAPI      │
└─────────────┘     │                          │     │  - OpenRouter   │
                    │  ┌────────────────────┐  │     │  - Perplexity   │
                    │  │ Rate Limiting (KV) │  │     │  - n8n Cloud    │
                    │  └────────────────────┘  │     └─────────────────┘
                    └──────────────────────────┘
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/search?q=...` | GET | SerpAPI Google Shopping |
| `/api/vision` | POST | OpenRouter GPT-4o Vision |
| `/api/perplexity` | POST | Perplexity search |
| `/api/n8n/*` | ANY | Proxy to n8n webhooks |

## Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account
- GitHub account
- API keys for: SerpAPI, OpenRouter, Perplexity

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/stylemirror-workers.git
cd stylemirror-workers
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

### 3. Create KV Namespace

```bash
# Create production KV namespace
npx wrangler kv:namespace create RATE_LIMIT_KV
# Output: { binding = "RATE_LIMIT_KV", id = "abc123..." }

# Create preview KV namespace (for local dev)
npx wrangler kv:namespace create RATE_LIMIT_KV --preview
# Output: { binding = "RATE_LIMIT_KV", preview_id = "xyz789..." }
```

Update `wrangler.toml` with the KV namespace IDs.

### 4. Set Secrets

```bash
# Set API keys as secrets (never commit these!)
npx wrangler secret put SERPAPI_KEY
npx wrangler secret put OPENROUTER_KEY
npx wrangler secret put PERPLEXITY_KEY
```

### 5. Local Development

```bash
npm run dev
# Worker running at http://localhost:8787
```

### 6. Deploy

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

## GitHub Actions Setup

### Required Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `SERPAPI_KEY` | SerpAPI key |
| `OPENROUTER_KEY` | OpenRouter API key |
| `PERPLEXITY_KEY` | Perplexity API key |

### Creating Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template
4. Add permissions:
   - Workers Scripts: Edit
   - Workers KV Storage: Edit
   - Workers Routes: Edit
5. Copy the token and add to GitHub secrets

### Deployment Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│ Push to     │────▶│ GitHub      │────▶│ Cloudflare      │
│ staging     │     │ Actions     │     │ Workers Staging │
└─────────────┘     └─────────────┘     └─────────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│ Push to     │────▶│ GitHub      │────▶│ Cloudflare      │
│ main        │     │ Actions     │     │ Workers Prod    │
└─────────────┘     └─────────────┘     └─────────────────┘
```

## Configuration

### Environment Variables

Edit `wrangler.toml` to configure:

```toml
[vars]
ALLOWED_ORIGINS = "https://your-app.lovable.app,https://yourdomain.com"
N8N_BASE_URL = "https://your-n8n.app.n8n.cloud"
```

### Rate Limits

Edit `src/index.ts` to adjust rate limits:

```typescript
const RATE_LIMITS = {
  search: { requests: 100, window: 3600 },  // 100 req/hour
  vision: { requests: 50, window: 3600 },   // 50 req/hour
  n8n: { requests: 200, window: 3600 },     // 200 req/hour
};
```

## Custom Domain Setup

1. Go to Cloudflare Dashboard → Workers & Pages → your worker
2. Click "Custom Domains" → "Add Custom Domain"
3. Enter `api.stylemirror.app` (or your domain)
4. Update `wrangler.toml` routes

## Usage Examples

### Search Products

```typescript
// Frontend code
const response = await fetch('https://api.stylemirror.app/api/search?q=red+dress');
const data = await response.json();
console.log(data.shopping_results);
```

### Vision Analysis

```typescript
const response = await fetch('https://api.stylemirror.app/api/vision', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image: 'data:image/jpeg;base64,...',
    prompt: 'Identify all fashion items'
  })
});
const data = await response.json();
```

### Proxy to n8n

```typescript
// This calls: https://your-n8n.app.n8n.cloud/webhook/smart-shopping/search
const response = await fetch('https://api.stylemirror.app/api/n8n/smart-shopping/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify({ query: 'blue jeans', userId: 'user123' })
});
```

## Monitoring

```bash
# View live logs
npm run tail:production

# View staging logs
npm run tail:staging
```

## Troubleshooting

### CORS Errors
- Check `ALLOWED_ORIGINS` in `wrangler.toml`
- Ensure your frontend domain is listed

### Rate Limit Issues
- Check KV namespace is correctly configured
- Verify KV IDs in `wrangler.toml`

### Deployment Failures
- Verify Cloudflare API token permissions
- Check GitHub Actions secrets are set correctly

## Contributing

1. Create feature branch from `staging`
2. Make changes
3. Test locally with `npm run dev`
4. Create PR to `staging`
5. After testing, merge `staging` → `main`

## License

MIT
