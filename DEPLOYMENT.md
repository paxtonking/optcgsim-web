# OPTCGSim Web - Deployment Guide

This guide covers deploying OPTCGSim Web to a Linux server.

## Prerequisites

- Linux server (Ubuntu 20.04+, Debian 11+, or Rocky Linux 8+)
- Domain name pointing to your server
- SSH access with sudo privileges

## Quick Start (Automated Setup)

1. SSH into your server
2. Run the setup script:

```bash
# Download and run setup script
curl -sSL https://raw.githubusercontent.com/YOUR_USERNAME/optcgsim-web/main/server-setup.sh -o setup.sh
chmod +x setup.sh

# Set your configuration
export DOMAIN="yourdomain.com"
export REPO_URL="https://github.com/YOUR_USERNAME/optcgsim-web.git"

# Run setup
./setup.sh
```

The script will:
- Install Node.js 20, Docker, Nginx, and PM2
- Clone your repository
- Configure PostgreSQL with secure credentials
- Build the application
- Set up Nginx with SSL
- Configure the firewall

## Manual Setup

### 1. Install Dependencies

**Ubuntu/Debian:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Install PM2
sudo npm install -g pm2
```

### 2. Clone Repository

```bash
sudo mkdir -p /var/www/optcgsim
sudo chown $USER:$USER /var/www/optcgsim
git clone YOUR_REPO_URL /var/www/optcgsim
cd /var/www/optcgsim
```

### 3. Configure Environment

Create `/var/www/optcgsim/.env` for Docker:
```env
POSTGRES_USER=optcgsim_user
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD
POSTGRES_DB=optcgsim
```

Create `/var/www/optcgsim/packages/server/.env`:
```env
DATABASE_URL="postgresql://optcgsim_user:YOUR_SECURE_PASSWORD@localhost:5432/optcgsim"
DIRECT_URL="postgresql://optcgsim_user:YOUR_SECURE_PASSWORD@localhost:5432/optcgsim"
JWT_SECRET="your-generated-jwt-secret"
JWT_REFRESH_SECRET="your-generated-refresh-secret"
PORT=4000
NODE_ENV=production
CLIENT_URL="https://yourdomain.com"
```

Generate secrets with: `openssl rand -base64 32`

Create `/var/www/optcgsim/packages/client/.env`:
```env
VITE_API_URL=https://yourdomain.com
VITE_WS_URL=wss://yourdomain.com
```

### 4. Start Database

```bash
cd /var/www/optcgsim
docker compose -f docker-compose.prod.yml up -d
```

### 5. Build Application

```bash
npm install
npm run db:push
npm run build
npm run db:seed  # First time only
```

### 6. Start Server with PM2

```bash
pm2 start packages/server/dist/index.js --name optcgsim-api
pm2 save
pm2 startup  # Follow the command it outputs
```

### 7. Configure Nginx

Copy the example config:
```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/optcgsim
sudo nano /etc/nginx/sites-available/optcgsim
# Edit YOUR_DOMAIN and paths
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/optcgsim /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 8. Setup SSL

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 9. Configure Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Deploying Updates

After pushing changes to your repository:

```bash
cd /var/www/optcgsim
./deploy.sh
```

Or manually:
```bash
git pull
npm install
npm run build
pm2 restart optcgsim-api
```

## Database Management

### Backup

```bash
./backup.sh
```

Backups are saved to `./backups/` with timestamps.

### Restore

```bash
gunzip -c backups/optcgsim_backup_TIMESTAMP.sql.gz | \
  docker exec -i optcgsim-postgres psql -U optcgsim_user -d optcgsim
```

### Access Database

```bash
docker exec -it optcgsim-postgres psql -U optcgsim_user -d optcgsim
```

## Monitoring

### View Logs

```bash
# Application logs
pm2 logs optcgsim-api

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Check Status

```bash
pm2 status
docker ps
sudo systemctl status nginx
```

### Health Check

```bash
curl http://localhost:4000/health
```

## Troubleshooting

### Application won't start

1. Check logs: `pm2 logs optcgsim-api`
2. Verify environment: `cat packages/server/.env`
3. Check database: `docker ps` and `docker logs optcgsim-postgres`

### WebSocket issues

1. Verify Nginx config has WebSocket headers
2. Check firewall allows port 443
3. Ensure SSL is configured correctly

### Database connection failed

1. Check Docker is running: `docker ps`
2. Verify credentials match between `.env` files
3. Test connection: `docker exec optcgsim-postgres pg_isready`

### 502 Bad Gateway

1. Check if backend is running: `pm2 status`
2. Verify port 4000 is correct in Nginx config
3. Check backend logs: `pm2 logs optcgsim-api`

## Security Checklist

- [ ] Changed default database password
- [ ] Generated new JWT secrets
- [ ] SSL certificate installed
- [ ] Firewall enabled
- [ ] Database only accessible from localhost
- [ ] `.env` files not committed to git
- [ ] Regular backups configured

## File Structure

```
/var/www/optcgsim/
├── packages/
│   ├── client/
│   │   ├── dist/          # Built frontend (served by Nginx)
│   │   └── .env           # Client environment
│   └── server/
│       ├── dist/          # Built backend (run by PM2)
│       └── .env           # Server environment
├── .env                   # Docker environment
├── deploy.sh              # Deployment script
├── backup.sh              # Backup script
├── docker-compose.prod.yml
└── backups/               # Database backups
```
