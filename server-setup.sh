#!/bin/bash
# OPTCGSim Web - Linux Server Setup Script
# Run this on a fresh Linux server to set up everything
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/server-setup.sh | bash
#   OR
#   chmod +x server-setup.sh && ./server-setup.sh
#
# Supports: Ubuntu 20.04+, Debian 11+, Rocky Linux 8+, Amazon Linux 2023

set -e

# Configuration - Edit these before running
DOMAIN="${DOMAIN:-}"
REPO_URL="${REPO_URL:-}"
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
echo "  OPTCGSim Web - Server Setup"
echo "========================================"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}Warning: Running as root. Creating a dedicated user is recommended.${NC}"
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
else
    echo -e "${RED}Cannot detect OS. Exiting.${NC}"
    exit 1
fi

echo -e "${GREEN}Detected OS: $OS $VERSION${NC}"

# Prompt for required values if not set
if [ -z "$DOMAIN" ]; then
    read -p "Enter your domain name (e.g., optcgsim.example.com): " DOMAIN
fi

if [ -z "$REPO_URL" ]; then
    read -p "Enter your Git repository URL: " REPO_URL
fi

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  Domain: $DOMAIN"
echo "  Repository: $REPO_URL"
echo "  Install directory: $INSTALL_DIR"
echo ""
read -p "Continue with setup? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled."
    exit 1
fi

# Install packages based on OS
echo -e "${GREEN}[1/8] Installing system packages...${NC}"

case $OS in
    ubuntu|debian)
        sudo apt update
        sudo apt install -y curl git nginx ufw

        # Install Node.js 20
        if ! command -v node &> /dev/null; then
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
        ;;

    rocky|almalinux|centos|rhel|amzn)
        sudo dnf update -y
        sudo dnf install -y curl git nginx firewalld

        # Install Node.js 20
        if ! command -v node &> /dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo dnf install -y nodejs
        fi

        # Install Docker
        if ! command -v docker &> /dev/null; then
            curl -fsSL https://get.docker.com | sudo sh
            sudo systemctl enable docker
            sudo systemctl start docker
            sudo usermod -aG docker $USER
        fi

        # Install certbot
        sudo dnf install -y certbot python3-certbot-nginx
        ;;

    *)
        echo -e "${RED}Unsupported OS: $OS${NC}"
        exit 1
        ;;
esac

# Install PM2
echo -e "${GREEN}[2/8] Installing PM2...${NC}"
sudo npm install -g pm2

# Create install directory
echo -e "${GREEN}[3/8] Setting up application directory...${NC}"
sudo mkdir -p $INSTALL_DIR
sudo chown $USER:$USER $INSTALL_DIR

# Clone repository
echo -e "${GREEN}[4/8] Cloning repository...${NC}"
if [ -d "$INSTALL_DIR/.git" ]; then
    cd $INSTALL_DIR
    git pull
else
    git clone $REPO_URL $INSTALL_DIR
    cd $INSTALL_DIR
fi

# Create Docker environment file
echo -e "${GREEN}[5/8] Configuring Docker...${NC}"
cat > $INSTALL_DIR/.env << EOF
POSTGRES_USER=optcgsim_user
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=optcgsim
POSTGRES_PORT=5432
EOF

# Start PostgreSQL
docker compose -f docker-compose.prod.yml up -d

# Wait for database to be ready
echo "Waiting for database to be ready..."
sleep 10

# Create server environment file
echo -e "${GREEN}[6/8] Configuring application...${NC}"
cat > $INSTALL_DIR/packages/server/.env << EOF
DATABASE_URL="postgresql://optcgsim_user:$DB_PASSWORD@localhost:5432/optcgsim"
DIRECT_URL="postgresql://optcgsim_user:$DB_PASSWORD@localhost:5432/optcgsim"
JWT_SECRET="$JWT_SECRET"
JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET"
PORT=4000
NODE_ENV=production
CLIENT_URL="https://$DOMAIN"
EOF

# Create client environment file
cat > $INSTALL_DIR/packages/client/.env << EOF
VITE_API_URL=https://$DOMAIN
VITE_WS_URL=wss://$DOMAIN
EOF

# Install dependencies and build
echo -e "${GREEN}[7/8] Installing dependencies and building...${NC}"
npm install
npm run db:push
npm run build

# Seed database
echo "Seeding database..."
npm run db:seed || echo "Seeding may have already been done"

# Setup PM2
pm2 start packages/server/dist/index.js --name optcgsim-api
pm2 save
pm2 startup | tail -1 | sudo bash

# Configure Nginx
echo -e "${GREEN}[8/8] Configuring Nginx...${NC}"
sudo tee /etc/nginx/sites-available/optcgsim > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN;

    root $INSTALL_DIR/packages/client/dist;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;

    location / {
        try_files \$uri \$uri/ /index.html;
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    location /api {
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
sudo ln -sf /etc/nginx/sites-available/optcgsim /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Configure firewall
echo "Configuring firewall..."
case $OS in
    ubuntu|debian)
        sudo ufw allow 22/tcp
        sudo ufw allow 80/tcp
        sudo ufw allow 443/tcp
        sudo ufw --force enable
        ;;
    rocky|almalinux|centos|rhel|amzn)
        sudo systemctl enable firewalld
        sudo systemctl start firewalld
        sudo firewall-cmd --permanent --add-service=ssh
        sudo firewall-cmd --permanent --add-service=http
        sudo firewall-cmd --permanent --add-service=https
        sudo firewall-cmd --reload
        ;;
esac

# Setup SSL
echo ""
echo -e "${YELLOW}Setting up SSL certificate...${NC}"
echo "Make sure your domain ($DOMAIN) points to this server's IP address."
read -p "Setup SSL now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || {
        echo -e "${YELLOW}SSL setup failed. Run manually later: sudo certbot --nginx -d $DOMAIN${NC}"
    }
fi

echo ""
echo -e "${GREEN}========================================"
echo "  Setup Complete!"
echo "========================================${NC}"
echo ""
echo -e "${BLUE}Important Information:${NC}"
echo "  Domain: https://$DOMAIN"
echo "  Install directory: $INSTALL_DIR"
echo "  Database password: $DB_PASSWORD"
echo ""
echo -e "${YELLOW}Save these credentials securely!${NC}"
echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "  View server logs: pm2 logs optcgsim-api"
echo "  Server status: pm2 status"
echo "  Restart server: pm2 restart optcgsim-api"
echo "  Deploy updates: cd $INSTALL_DIR && ./deploy.sh"
echo ""
echo -e "${YELLOW}Note: You may need to log out and back in for Docker group membership to take effect.${NC}"
