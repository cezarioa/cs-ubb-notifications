#!/bin/bash

echo "🚀 CS UBB Announcement Notifier - Setup Script"
echo "=============================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✓ Node.js version: $(node -v)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✓ Dependencies installed"
echo ""

# Generate VAPID keys
echo "🔑 Generating VAPID keys..."
VAPID_OUTPUT=$(node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))")

if [ $? -ne 0 ]; then
    echo "❌ Failed to generate VAPID keys"
    exit 1
fi

PUBLIC_KEY=$(echo $VAPID_OUTPUT | node -e "const data=require('fs').readFileSync(0,'utf-8'); console.log(JSON.parse(data).publicKey)")
PRIVATE_KEY=$(echo $VAPID_OUTPUT | node -e "const data=require('fs').readFileSync(0,'utf-8'); console.log(JSON.parse(data).privateKey)")

echo "✓ VAPID keys generated"
echo ""

# Create .env file
if [ -f .env ]; then
    echo "⚠️  .env file already exists. Creating .env.new instead..."
    ENV_FILE=".env.new"
else
    ENV_FILE=".env"
fi

cat > $ENV_FILE << EOF
# Server Configuration
PORT=3000
NODE_ENV=development

# Database (use your local PostgreSQL or Railway URL)
DATABASE_URL=postgresql://localhost/announcement_notifier

# VAPID Keys for Web Push
VAPID_PUBLIC_KEY=$PUBLIC_KEY
VAPID_PRIVATE_KEY=$PRIVATE_KEY
VAPID_EMAIL=your-email@example.com

EOF

echo "✓ Environment file created: $ENV_FILE"
echo ""

# Instructions
echo "📋 Next Steps:"
echo "=============="
echo ""
echo "1. Edit $ENV_FILE and update:"
echo "   - DATABASE_URL (if not using local PostgreSQL)"
echo "   - VAPID_EMAIL (your contact email)"
echo ""
echo "2. If using local PostgreSQL, create database:"
echo "   createdb announcement_notifier"
echo ""
echo "3. Start the development server:"
echo "   npm run dev"
echo ""
echo "4. Test the health endpoint:"
echo "   curl http://localhost:3000/health"
echo ""
echo "5. For Railway deployment:"
echo "   - Create new project on railway.app"
echo "   - Add PostgreSQL database"
echo "   - Set environment variables from $ENV_FILE"
echo "   - Deploy from GitHub"
echo ""
echo "🎉 Setup complete! Your VAPID keys have been generated."
echo ""
echo "⚠️  IMPORTANT: Keep your VAPID_PRIVATE_KEY secure and never commit it to git!"