#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 Recreating PostgreSQL Database (Fresh Install)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if Docker is running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker is not running!"
    exit 1
fi

echo "⚠️  This will delete ALL existing data in the database!"
echo ""
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Cancelled."
    exit 0
fi

echo ""
echo "🛑 Stopping containers..."
docker-compose down

echo ""
echo "🗑️  Removing database volumes..."
docker volume rm project6m_postgres_data 2>/dev/null || docker volume rm facebook-keyword_postgres_data 2>/dev/null || echo "   No volume found (OK)"

echo ""
echo "🚀 Starting fresh containers..."
docker-compose up -d

echo ""
echo "⏳ Waiting for database to initialize (30 seconds)..."
sleep 30

echo ""
echo "🔌 Testing connection..."
if command -v node &> /dev/null; then
    node test-db-connection.js
else
    echo "⚠️  Node.js not found. Skipping test."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Database recreated successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
