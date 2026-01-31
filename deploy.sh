#!/bin/bash
# OPTCGSim Web - Deployment Script
# Run this on your server to deploy updates

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  OPTCGSim Web - Deployment"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if this is initial setup or update
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}First time setup detected...${NC}"
    FIRST_RUN=true
else
    FIRST_RUN=false
fi

# Create pre-deployment backup (skip on first run)
if [ "$FIRST_RUN" = false ]; then
    echo -e "${GREEN}[0/6] Creating pre-deployment backup...${NC}"
    BACKUP_DIR="$SCRIPT_DIR/backups/pre-deploy"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    docker exec optcgsim-postgres pg_dump -U optcgsim_user optcgsim > "$BACKUP_DIR/pre-deploy_$TIMESTAMP.sql" 2>/dev/null || echo -e "${YELLOW}Backup skipped (database not running)${NC}"

    # Keep only last 5 pre-deploy backups
    ls -t "$BACKUP_DIR"/pre-deploy_*.sql 2>/dev/null | tail -n +6 | xargs -r rm
    echo -e "${GREEN}Backup saved: pre-deploy_$TIMESTAMP.sql${NC}"
fi

# Pull latest changes
echo -e "${GREEN}[1/6] Pulling latest changes...${NC}"
git pull origin main || git pull origin master

# Install dependencies
echo -e "${GREEN}[2/6] Installing dependencies...${NC}"
npm install

# Run database migrations
echo -e "${GREEN}[3/6] Running database migrations...${NC}"
npm run db:push

# Build the project
echo -e "${GREEN}[4/6] Building project...${NC}"
npm run build

# Seed database if first run
if [ "$FIRST_RUN" = true ]; then
    echo -e "${GREEN}[5/6] Seeding database with card data...${NC}"
    npm run db:seed || echo -e "${YELLOW}Seeding skipped or already complete${NC}"
else
    echo -e "${GREEN}[5/6] Skipping seed (not first run)${NC}"
fi

# Restart the server
echo -e "${GREEN}[6/6] Restarting server...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 restart optcgsim-api 2>/dev/null || pm2 start packages/server/dist/index.js --name optcgsim-api
    pm2 save
else
    echo -e "${YELLOW}PM2 not installed. Start server manually with:${NC}"
    echo "  node packages/server/dist/index.js"
fi

echo ""
echo -e "${GREEN}========================================"
echo "  Deployment Complete!"
echo "========================================${NC}"
echo ""
echo "Server should be running on port ${PORT:-4000}"
echo "Check status with: pm2 status"
echo "View logs with: pm2 logs optcgsim-api"
