# 🔄 Auto Import Guide

## How It Works

The Facebook scraper (`facebookkey.js`) now has **built-in automatic data import** that runs after each scraping cycle. You no longer need to manually run import commands!

## 📊 Data Flow

```
facebookkey.js (Scraper)
    ↓ (saves in real-time)
PostgreSQL Database
    ↓ (optional backup)
CSV/JSON Files (facebook_data/)
    ↓ (auto-import after each cycle)
PostgreSQL Database (synchronized)
    ↓ (live updates)
Dashboard (http://localhost:8081)
```

## ✅ Auto Import Features

### 1. **Real-Time Database Saving**
- Every post is saved directly to database via API (`/api/posts/save`)
- No manual steps required
- Data appears in dashboard immediately

### 2. **Auto Import After Each Cycle**
- After each scraping cycle completes, the scraper automatically triggers `/api/import`
- This imports any data from CSV/JSON files that wasn't already in the database
- Located in `facebookkey.js` lines 7654-7712

### 3. **Duplicate Prevention**
- Import checks if posts already exist (by URL)
- Only new posts are added
- Safe to run multiple times

## 🎯 When You Need Manual Import

Manual import is only needed in these cases:

1. **You ran the scraper when API was offline**
   - CSV/JSON files were created
   - But data didn't reach database

2. **You have old CSV/JSON files**
   - From previous scraping sessions
   - That haven't been imported yet

3. **After restoring from backup**
   - You have backup CSV/JSON files
   - Want to re-import them

## 🚀 Manual Import Options

### Option 1: Use the Batch Script (Easiest)
```batch
import-data.bat
```

This script will:
- ✅ Restart API container
- ✅ Trigger import from CSV/JSON files
- ✅ Show database statistics
- ✅ Guide you to clear browser cache

### Option 2: Direct API Call
```bash
curl -X POST http://localhost:3002/api/import
```

### Option 3: Docker Command
```bash
docker-compose exec api npm run import
```

### Option 4: Node.js Direct
```bash
cd backend
node import.js
```

## 🔍 Check If Auto Import Is Working

### 1. Watch Scraper Logs
When scraper finishes a cycle, you should see:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 AUTO-IMPORT: Triggering database import...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   📤 Import started...
   ✅ Import completed successfully!

📊 Dashboard will auto-refresh in 30 seconds
```

### 2. Check Database Count
```batch
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data -c "SELECT COUNT(*) FROM posts;"
```

### 3. Check CSV/JSON Files Exist
```batch
dir facebook_data\*.csv
dir facebook_data\*.json
```

## 🛠️ Troubleshooting

### "Auto-import failed: ECONNREFUSED"

**Problem:** API container not running or wrong port

**Solution:**
```batch
# Check API is running
docker ps | findstr facebook-api

# Check API health
curl http://localhost:3002/health

# Restart API if needed
docker-compose restart api
```

### "Dashboard shows less posts than CSV/JSON files"

**Problem:** Import hasn't run or failed silently

**Solution:**
```batch
# Run manual import
import-data.bat

# Or direct:
curl -X POST http://localhost:3002/api/import
```

### "Import says '0 imported, X skipped'"

**Problem:** All posts already in database (duplicates)

**Solution:** This is normal! It means your data is already imported. No action needed.

## 📁 File Locations

- **CSV/JSON Files:** `./facebook_data/`
- **Import Script:** `./backend/import.js`
- **Auto-import Code:** `./facebookkey.js` (lines 7654-7712)
- **Manual Import Batch:** `./import-data.bat`

## 💡 Pro Tips

1. **Always keep Docker containers running** while scraping
   - Ensures real-time database saves work
   - Auto-import can trigger successfully

2. **Check dashboard after each scraping cycle**
   - Should see new posts appear
   - If not, check scraper logs for errors

3. **Clear browser cache** after import
   - Press `Ctrl+Shift+Delete`
   - Or use Incognito/Private mode
   - Ensures you see fresh data

4. **CSV/JSON are backups**
   - Primary data goes to database
   - CSV/JSON serve as backup copies
   - Safe to delete if database has all data

## 🎉 Summary

**You don't need to manually import anymore!**

The scraper automatically:
1. ✅ Saves posts to database in real-time
2. ✅ Saves backup CSV/JSON files
3. ✅ Triggers import after each cycle
4. ✅ Keeps database and files synchronized

Just run `facebookkey.js` and let it work! 🚀
