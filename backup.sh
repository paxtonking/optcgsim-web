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
#
# Optional: Set BACKUP_REMOTE to sync to cloud storage
#   export BACKUP_REMOTE="s3://your-bucket/optcgsim-backups"
#   or
#   export BACKUP_REMOTE="user@remote-server:/path/to/backups"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${1:-$SCRIPT_DIR/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/optcgsim_backup_$TIMESTAMP.sql"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] Starting database backup...${NC}"

# Check if Docker container is running
if ! docker ps | grep -q optcgsim-postgres; then
    echo -e "${RED}Error: PostgreSQL container is not running.${NC}"
    exit 1
fi

# Create backup using docker
docker exec optcgsim-postgres pg_dump -U optcgsim_user optcgsim > "$BACKUP_FILE"

# Check if backup was successful
if [ ! -s "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file is empty${NC}"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Compress the backup
gzip "$BACKUP_FILE"
BACKUP_FILE="$BACKUP_FILE.gz"

# Get file size
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo -e "${GREEN}Backup created: $BACKUP_FILE ($SIZE)${NC}"

# Clean up old backups (keep last N days)
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "optcgsim_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Sync to remote storage if configured
if [ -n "$BACKUP_REMOTE" ]; then
    echo "Syncing to remote: $BACKUP_REMOTE"
    if [[ "$BACKUP_REMOTE" == s3://* ]]; then
        # AWS S3
        aws s3 cp "$BACKUP_FILE" "$BACKUP_REMOTE/" || echo -e "${YELLOW}Warning: S3 sync failed${NC}"
    elif [[ "$BACKUP_REMOTE" == *:* ]]; then
        # Remote server via rsync
        rsync -avz "$BACKUP_FILE" "$BACKUP_REMOTE/" || echo -e "${YELLOW}Warning: Remote sync failed${NC}"
    fi
fi

# List remaining backups
echo ""
echo "Available backups:"
ls -lh "$BACKUP_DIR"/optcgsim_backup_*.sql.gz 2>/dev/null || echo "No backups found"

echo ""
echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete${NC}"
echo ""
echo -e "${YELLOW}To restore: ./restore.sh $BACKUP_FILE${NC}"
