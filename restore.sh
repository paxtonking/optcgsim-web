#!/bin/bash
# OPTCGSim Web - Database Restore Script
# Restores the database from a backup file
#
# Usage:
#   ./restore.sh                           # Interactive - lists available backups
#   ./restore.sh backups/backup.sql.gz     # Restore specific backup (gzipped)
#   ./restore.sh backups/backup.sql        # Restore specific backup (uncompressed)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "========================================"
echo "  OPTCGSim Web - Database Restore"
echo "========================================"
echo -e "${NC}"

# Check if Docker container is running
if ! docker ps | grep -q optcgsim-postgres; then
    echo -e "${RED}Error: PostgreSQL container is not running.${NC}"
    echo "Start it with: docker compose -f docker-compose.prod.yml up -d"
    exit 1
fi

# Get backup file
BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Available backups:"
    echo ""

    # List all backups
    echo -e "${YELLOW}Daily backups:${NC}"
    ls -lh backups/optcgsim_backup_*.sql.gz 2>/dev/null || echo "  None found"
    echo ""

    echo -e "${YELLOW}Pre-deployment backups:${NC}"
    ls -lh backups/pre-deploy/pre-deploy_*.sql 2>/dev/null || echo "  None found"
    echo ""

    echo -e "${BLUE}Usage: ./restore.sh <backup-file>${NC}"
    echo ""
    echo "Examples:"
    echo "  ./restore.sh backups/optcgsim_backup_20240131_020000.sql.gz"
    echo "  ./restore.sh backups/pre-deploy/pre-deploy_20240131_143022.sql"
    exit 0
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

# Confirm restore
echo -e "${YELLOW}WARNING: This will overwrite the current database!${NC}"
echo ""
echo "Backup file: $BACKUP_FILE"
echo "Database: optcgsim"
echo ""
read -p "Are you sure you want to restore? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Create a backup of current state before restoring
echo -e "${GREEN}Creating backup of current state...${NC}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p backups/pre-restore
docker exec optcgsim-postgres pg_dump -U optcgsim_user optcgsim > "backups/pre-restore/pre-restore_$TIMESTAMP.sql"
echo "Current state saved to: backups/pre-restore/pre-restore_$TIMESTAMP.sql"
echo ""

# Stop the application
echo -e "${GREEN}Stopping application...${NC}"
pm2 stop optcgsim-api 2>/dev/null || echo "Application not running with PM2"

# Restore the database
echo -e "${GREEN}Restoring database...${NC}"

# Check if file is gzipped
if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | docker exec -i optcgsim-postgres psql -U optcgsim_user -d optcgsim
else
    docker exec -i optcgsim-postgres psql -U optcgsim_user -d optcgsim < "$BACKUP_FILE"
fi

# Restart the application
echo -e "${GREEN}Restarting application...${NC}"
pm2 start optcgsim-api 2>/dev/null || echo "Start application manually with: pm2 start packages/server/dist/index.js --name optcgsim-api"

echo ""
echo -e "${GREEN}========================================"
echo "  Restore Complete!"
echo "========================================${NC}"
echo ""
echo "Database restored from: $BACKUP_FILE"
echo "Pre-restore backup: backups/pre-restore/pre-restore_$TIMESTAMP.sql"
echo ""
echo "If something went wrong, restore the pre-restore backup:"
echo "  ./restore.sh backups/pre-restore/pre-restore_$TIMESTAMP.sql"
