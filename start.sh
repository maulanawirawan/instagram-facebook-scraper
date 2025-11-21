#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Facebook Keyword Scraper - Quick Start"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env created"
    echo ""
fi

# Check if Docker is running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo "   Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker is not running!"
    echo "   Please start Docker Desktop first"
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Start Docker containers
echo "🐳 Starting Docker containers..."
docker-compose up -d

echo ""
echo "⏳ Waiting for database to be ready..."
sleep 10

# Test database connection
echo "🔌 Testing database connection..."
if command -v node &> /dev/null; then
    node test-db-connection.js
else
    echo "⚠️  Node.js not found. Skipping connection test."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Access your services:"
echo "   Dashboard:  http://localhost:8080"
echo "   API:        http://localhost:3000"
echo "   pgAdmin:    http://localhost:5050"
echo ""
echo "🤖 Start scraping:"
echo "   node facebookkey.js"
echo ""
echo "📖 For detailed instructions, see SETUP_INSTRUCTIONS.md"
echo ""
