#!/bin/bash
# OPTCGSim Web - Database Backup Script
# Creates a timestamped backup of the PostgreSQL database
#
# Usage:
#   ./backup.sh                    # Create backup in ./backups/
#   ./backup.sh /path/to/backups   # Create backup in specified directory
#
# Recommended: Add to crontab for automatic daily backups
#   0 2 * * * /var/www/optcgsim/backup.sh >> /var/log/optcgsim-backup.log 2>&1

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${1:-$SCRIPT_DIR/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/optcgsim_backup_$TIMESTAMP.sql"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}Creating database backup...${NC}"

# Create backup using docker
docker exec optcgsim-postgres pg_dump -U optcgsim_user optcgsim > "$BACKUP_FILE"

# Compress the backup
gzip "$BACKUP_FILE"
BACKUP_FILE="$BACKUP_FILE.gz"

# Get file size
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo -e "${GREEN}Backup created: $BACKUP_FILE ($SIZE)${NC}"

# Clean up old backups (keep last 7 days)
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -name "optcgsim_backup_*.sql.gz" -mtime +7 -delete

# List remaining backups
echo ""
echo "Available backups:"
ls -lh "$BACKUP_DIR"/optcgsim_backup_*.sql.gz 2>/dev/null || echo "No backups found"

echo ""
echo -e "${YELLOW}To restore a backup:${NC}"
echo "  gunzip -c backup.sql.gz | docker exec -i optcgsim-postgres psql -U optcgsim_user -d optcgsim"
