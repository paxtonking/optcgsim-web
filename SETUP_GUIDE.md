# OPTCGSim Web - Setup Guide

## Current Setup Status
- ✅ Dependencies installed
- ✅ Environment variables configured
- ⏳ Database pending setup
- ⏳ Card data pending import

## Next Steps

### Option 1: Use Supabase (Recommended for Quick Start)
1. Go to [Supabase](https://supabase.com) and create a free account
2. Create a new project (remember your database password!)
3. Once project is ready, go to **Settings > Database**
4. Copy the connection URLs:
   - **Connection pooling URL** (port 6543) → paste in `DATABASE_URL` in `.env`
   - **Direct connection URL** (port 5432) → paste in `DIRECT_URL` in `.env`
5. Run database migration:
   ```bash
   cd packages/server
   npx prisma db push
   ```

### Option 2: Install PostgreSQL Locally
1. Download PostgreSQL from [postgresql.org](https://www.postgresql.org/download/windows/)
2. Install with default settings
3. Create database:
   ```bash
   psql -U postgres
   CREATE DATABASE optcgsim;
   \q
   ```
4. Update `.env` file with local database URLs
5. Run migration as shown above

## Start Development Servers

Once database is configured:

```bash
# From root directory
npm run dev

# This starts both:
# - Frontend: http://localhost:3000
# - Backend: http://localhost:4000
```

## Import Card Data

After servers are running:

```bash
cd tools/card-importer
# Fetch card metadata from OPTCG API
npx tsx src/fetch-cards.ts
```

## Troubleshooting

### Database Connection Issues
- Ensure your Supabase project is active (not paused)
- Check that both DATABASE_URL and DIRECT_URL are correctly set
- Verify password doesn't contain special characters that need escaping

### Port Conflicts
- Frontend uses port 3000
- Backend uses port 4000
- Change in respective .env files if needed

### Missing Dependencies
- Run `npm install` from root directory
- For specific package: `cd packages/[name] && npm install`