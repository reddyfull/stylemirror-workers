#!/bin/bash
# StyleMirror Workers Setup Script
# Run this after cloning the repo

set -e

echo "🚀 StyleMirror Workers Setup"
echo "============================"

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"

if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
fi
echo "✅ npm $(npm -v)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Login to Cloudflare
echo ""
echo "🔐 Cloudflare Authentication"
echo "You'll need to authenticate with Cloudflare."
read -p "Press Enter to open browser for Cloudflare login..."
npx wrangler login

# Create KV namespaces
echo ""
echo "📁 Creating KV Namespaces..."
echo "Creating production namespace..."
PROD_KV=$(npx wrangler kv:namespace create RATE_LIMIT_KV 2>&1 | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
echo "Production KV ID: $PROD_KV"

echo "Creating preview namespace..."
PREVIEW_KV=$(npx wrangler kv:namespace create RATE_LIMIT_KV --preview 2>&1 | grep -o 'preview_id = "[^"]*"' | cut -d'"' -f2)
echo "Preview KV ID: $PREVIEW_KV"

# Update wrangler.toml
echo ""
echo "📝 Updating wrangler.toml..."
if [ -n "$PROD_KV" ] && [ -n "$PREVIEW_KV" ]; then
    sed -i.bak "s/REPLACE_WITH_KV_NAMESPACE_ID/$PROD_KV/" wrangler.toml
    sed -i.bak "s/REPLACE_WITH_PREVIEW_KV_NAMESPACE_ID/$PREVIEW_KV/" wrangler.toml
    rm wrangler.toml.bak
    echo "✅ KV namespace IDs updated"
else
    echo "⚠️  Could not auto-update KV IDs. Please update wrangler.toml manually."
fi

# Set secrets
echo ""
echo "🔑 Setting API Secrets"
echo "You'll be prompted to enter each secret. Paste the value and press Enter."
echo ""

read -p "Enter SERPAPI_KEY (or press Enter to skip): " SERPAPI
if [ -n "$SERPAPI" ]; then
    echo "$SERPAPI" | npx wrangler secret put SERPAPI_KEY
fi

read -p "Enter OPENROUTER_KEY (or press Enter to skip): " OPENROUTER
if [ -n "$OPENROUTER" ]; then
    echo "$OPENROUTER" | npx wrangler secret put OPENROUTER_KEY
fi

read -p "Enter PERPLEXITY_KEY (or press Enter to skip): " PERPLEXITY
if [ -n "$PERPLEXITY" ]; then
    echo "$PERPLEXITY" | npx wrangler secret put PERPLEXITY_KEY
fi

# Summary
echo ""
echo "✅ Setup Complete!"
echo "=================="
echo ""
echo "Next steps:"
echo "1. Review wrangler.toml and update ALLOWED_ORIGINS and N8N_BASE_URL"
echo "2. Run 'npm run dev' to test locally"
echo "3. Run 'npm run deploy' to deploy to Cloudflare"
echo ""
echo "For GitHub Actions deployment, add these secrets to your repo:"
echo "  - CLOUDFLARE_API_TOKEN"
echo "  - CLOUDFLARE_ACCOUNT_ID"
echo "  - SERPAPI_KEY"
echo "  - OPENROUTER_KEY"
echo "  - PERPLEXITY_KEY"
echo ""
echo "Happy coding! 🎉"
