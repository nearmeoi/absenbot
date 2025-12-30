#!/bin/bash
set -e

echo "🥔 Starting VPS Kentang Deployment..."

# 1. Update & Install dependencies
echo "📦 Installing system dependencies..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y git curl wget unzip libgbm-dev
fi

# Install Node.js 18+ (if not exists)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 2. Setup directory
APP_DIR=~/absenbot
mkdir -p $APP_DIR
cd $APP_DIR

# 3. Clone/Pull
if [ -d ".git" ]; then
    echo "⬇️ Updating existing repo..."
    git pull origin main
else
    echo "⬇️ Cloning repo (Lite mode)..."
    git clone --depth 1 https://github.com/nearmeoi/absenbot .
fi

# 4. Install NPM (Production)
echo "🧹 Installing npm dependencies..."
rm -rf node_modules
npm install --production

# 5. Setup Env
if [ ! -f ".env" ]; then
    echo "📝 Creating .env..."
    cp .env.example .env
    # Add VPS specific config
    echo "" >> .env
    echo "# VPS Optimization" >> .env
    echo "ENVIRONMENT=vps" >> .env
    echo "NODE_ENV=production" >> .env
else
    # Ensure VPS env var is set
    if ! grep -q "ENVIRONMENT=vps" .env; then
        echo "ENVIRONMENT=vps" >> .env
    fi
fi

# 6. Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# 7. Start
echo "🚀 Starting Bot with Memory Limit..."
pm2 delete absenbot 2>/dev/null || true
# Limit memory to 256MB to fit in small VPS
pm2 start index.js --name "absenbot" --node-args="--max-old-space-size=256"

echo "✅ DEPLOYMENT SUCCESS!"
echo "👉 Check logs: pm2 log absenbot"
