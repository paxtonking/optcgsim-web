#!/bin/bash
# OPTCGSim Web - API Server Setup Script (Frontend on Vercel)
# Run this when hosting frontend on Vercel and only need API server
#
# Usage:
#   chmod +x server-setup-api-only.sh
#   export DOMAIN="api.davybackduels.com"
#   export FRONTEND_URL="https://davybackduels.com"
#   ./server-setup-api-only.sh

set -e

# Configuration
API_DOMAIN="${DOMAIN:-}"
FRONTEND_URL="${FRONTEND_URL:-}"
REPO_URL="${REPO_URL:-https://github.com/paxtonking/optcgsim-web.git}"
INSTALL_DIR="${INSTALL_DIR:-/var/www/optcgsim}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 32)}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$(openssl rand -base64 32)}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "========================================"
echo "  OPTCGSim Web - API Server Setup"
echo "  (Frontend hosted on Vercel)"
echo "========================================"
echo -e "${NC}"

# Prompt for required values if not set
if [ -z "$API_DOMAIN" ]; then
    read -p "Enter your API domain (e.g., api.davybackduels.com): " API_DOMAIN
fi

if [ -z "$FRONTEND_URL" ]; then
    read -p "Enter your frontend URL (e.g., https://davybackduels.com): " FRONTEND_URL
fi

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  API Domain: $API_DOMAIN"
echo "  Frontend URL: $FRONTEND_URL"
echo "  Repository: $REPO_URL"
echo "  Install directory: $INSTALL_DIR"
echo ""
read -p "Continue with setup? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled."
    exit 1
fi

# Install packages
echo -e "${GREEN}[1/7] Installing system packages...${NC}"
sudo apt update
sudo apt install -y curl git nginx ufw

# Install Node.js 20
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Install Docker
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
fi

# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Install PM2
echo -e "${GREEN}[2/7] Installing PM2...${NC}"
sudo npm install -g pm2

# Create install directory
echo -e "${GREEN}[3/7] Setting up application directory...${NC}"
sudo mkdir -p $INSTALL_DIR
sudo chown $USER:$USER $INSTALL_DIR

# Clone repository
if [ -d "$INSTALL_DIR/.git" ]; then
    cd $INSTALL_DIR
    git pull
else
    git clone $REPO_URL $INSTALL_DIR
    cd $INSTALL_DIR
fi

# Create Docker environment file
echo -e "${GREEN}[4/7] Configuring Docker...${NC}"
cat > $INSTALL_DIR/.env << EOF
POSTGRES_USER=optcgsim_user
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=optcgsim
POSTGRES_PORT=5432
EOF

# Start PostgreSQL
docker compose -f docker-compose.prod.yml up -d

# Wait for database
echo "Waiting for database to be ready..."
sleep 10

# Create server environment file
echo -e "${GREEN}[5/7] Configuring application...${NC}"
cat > $INSTALL_DIR/packages/server/.env << EOF
DATABASE_URL="postgresql://optcgsim_user:$DB_PASSWORD@localhost:5432/optcgsim"
DIRECT_URL="postgresql://optcgsim_user:$DB_PASSWORD@localhost:5432/optcgsim"
JWT_SECRET="$JWT_SECRET"
JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET"
PORT=4000
NODE_ENV=production
CLIENT_URL="$FRONTEND_URL,${FRONTEND_URL/https/http},https://www.${FRONTEND_URL#https://}"
EOF

# Install dependencies and build (server only)
echo -e "${GREEN}[6/7] Installing dependencies and building...${NC}"
npm install
npm run db:push
cd packages/server && npm run build && cd ../..

# Seed database
echo "Seeding database..."
npm run db:seed || echo "Seeding may have already been done"

# Setup PM2
pm2 start packages/server/dist/index.js --name optcgsim-api
pm2 save
pm2 startup | tail -1 | sudo bash

# Configure Nginx for API only
echo -e "${GREEN}[7/7] Configuring Nginx...${NC}"
sudo tee /etc/nginx/sites-available/optcgsim-api > /dev/null << EOF
server {
    listen 80;
    server_name $API_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /socket.io {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/optcgsim-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Configure firewall
echo "Configuring firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Setup SSL
echo ""
echo -e "${YELLOW}Setting up SSL certificate...${NC}"
echo "Make sure $API_DOMAIN points to this server's IP address."
read -p "Setup SSL now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo certbot --nginx -d $API_DOMAIN --non-interactive --agree-tos --email admin@${API_DOMAIN#api.} || {
        echo -e "${YELLOW}SSL setup failed. Run manually: sudo certbot --nginx -d $API_DOMAIN${NC}"
    }
fi

echo ""
echo -e "${GREEN}========================================"
echo "  API Server Setup Complete!"
echo "========================================${NC}"
echo ""
echo -e "${BLUE}Important Information:${NC}"
echo "  API URL: https://$API_DOMAIN"
echo "  Frontend URL: $FRONTEND_URL"
echo "  Database password: $DB_PASSWORD"
echo ""
echo -e "${YELLOW}Save these credentials securely!${NC}"
echo ""
echo -e "${BLUE}Vercel Environment Variables:${NC}"
echo "  VITE_API_URL=https://$API_DOMAIN"
echo "  VITE_WS_URL=wss://$API_DOMAIN"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "  View logs: pm2 logs optcgsim-api"
echo "  Restart: pm2 restart optcgsim-api"
echo "  Deploy updates: cd $INSTALL_DIR && ./deploy.sh"
