# 🎯 API-Based Real-Time Data Pipeline (PROBLEM SOLVED!)

## ✅ MASALAH SOLVED:

### Masalah Lama:
- ❌ "role fbadmin does not exist"
- ❌ Error Code 28P01/28000 (authentication failed)
- ❌ Connection dari host ke PostgreSQL container gagal
- ❌ Repot setup database manual

### Solusi Baru:
- ✅ **facebookkey.js** kirim data via HTTP ke **Backend API**
- ✅ **Backend API** (Docker) langsung save ke **PostgreSQL** (Docker)
- ✅ **Gak perlu** connection database dari host machine!
- ✅ **Zero** authentication errors!

---

## 🏗️ ARSITEKTUR BARU:

```
┌─────────────────────────────────────────────────────────────┐
│                    HOST MACHINE                             │
│                                                              │
│  ┌────────────────┐                                         │
│  │ facebookkey.js │  (Scraper)                              │
│  │  (Node.js)     │                                         │
│  └────────┬───────┘                                         │
│           │                                                  │
│           │ HTTP POST                                        │
│           │ /api/posts/save                                 │
│           │ /api/comments/save                              │
└───────────┼──────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│                   DOCKER NETWORK                            │
│                                                              │
│  ┌────────────────┐           ┌─────────────────┐          │
│  │  Backend API   │──────────▶│   PostgreSQL    │          │
│  │  (Express.js)  │   Direct  │   (Database)    │          │
│  │  Port: 3000    │   Access  │   Port: 5432    │          │
│  └────────────────┘           └─────────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Kenapa Ini Work?**
- Backend API dan PostgreSQL **sama-sama di Docker network**
- Backend bisa akses PostgreSQL dengan hostname `postgres` (internal)
- facebookkey.js cuma perlu HTTP access ke API (port 3000)
- **Gak ada masalah authentication!**

---

## 🚀 CARA PAKAI (SUPER SIMPLE):

### 1. Pull latest code
```bash
git pull origin claude/rebuild-data-pipeline-01P5y4dgwh7hNtVjFNTJfwtx
```

### 2. Copy .env.example ke .env (jika belum ada)
```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

### 3. Edit .env - Set API URL
```env
API_BASE_URL=http://localhost:3000
# Ganti ke 3002 jika API kamu running di port 3002
```

### 4. Start Docker containers
```bash
docker-compose up -d
```

Tunggu sampai semua services running:
```bash
docker ps
```

Expected output:
```
facebook-postgres    (PostgreSQL)
facebook-api         (Backend API)  ← PENTING!
facebook-frontend    (Dashboard)
facebook-pgadmin     (DB Admin)
```

### 5. Cek API Status
```bash
# Test API health
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","database":"connected","timestamp":"..."}
```

Jika error, cek logs:
```bash
docker-compose logs api
```

### 6. Jalankan Scraper
```bash
node facebookkey.js
```

**Expected Output:**
```
✅ API connected: connected
   API URL: http://localhost:3000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 Facebook Keyword Scraper - Starting...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**DONE!** Data akan langsung save ke database via API! 🎉

---

## 📡 NEW API ENDPOINTS:

Backend API sekarang punya endpoint baru untuk real-time save:

### 1. **POST /api/posts/save**
Save single post from scraper

**Request:**
```json
{
  "author": "John Doe",
  "post_url": "https://facebook.com/...",
  "text": "Post content...",
  "reactions": 100,
  "comments": 50,
  "shares": 10,
  ...
}
```

**Response:**
```json
{
  "success": true,
  "action": "inserted",  // or "updated"
  "id": 123
}
```

### 2. **POST /api/comments/save**
Save multiple comments from scraper

**Request:**
```json
{
  "comments": [
    {
      "post_url": "...",
      "comment_id": "123",
      "comment_author": "Jane Doe",
      "comment_text": "Great post!",
      ...
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "saved": 5,
  "skipped": 2,
  "total": 7
}
```

### 3. **POST /api/import**
Import from existing CSV/JSON files (existing endpoint)

**Request:** Empty POST
**Response:** Streaming JSON with import progress

---

## 🔧 TROUBLESHOOTING:

### Error: "API connection failed"

**Penyebab:** Backend API tidak running

**Solusi:**
```bash
# Check if API container is running
docker ps | grep facebook-api

# If not running, start it
docker-compose up -d api

# Check logs for errors
docker-compose logs api
```

### Error: "ECONNREFUSED" saat akses API

**Penyebab:** Port salah atau API belum ready

**Solusi:**
```bash
# Check API port in docker-compose.yml
# Should be: ports: - "3000:3000"

# Or check your .env file
cat .env | grep API_BASE_URL

# Test with curl
curl http://localhost:3000/health
```

### API running tapi error "database connection failed"

**Penyebab:** PostgreSQL container not ready

**Solusi:**
```bash
# Restart containers in order
docker-compose restart postgres
sleep 10
docker-compose restart api

# Verify database is healthy
docker exec facebook-postgres psql -U fbadmin -d facebook_data -c "SELECT 1;"
```

### Data tidak masuk database

**Solusi:**
```bash
# 1. Check scraper logs - pastikan "✅ API connected"
node facebookkey.js

# 2. Check API logs - lihat POST requests
docker-compose logs -f api

# 3. Check database - lihat row count
docker exec facebook-postgres psql -U fbadmin -d facebook_data -c "SELECT COUNT(*) FROM posts;"
```

---

## 📊 MONITORING:

### Check API Health
```bash
curl http://localhost:3000/health
```

### Check Data Count
```bash
# Via API
curl http://localhost:3000/api/stats

# Via Database
docker exec facebook-postgres psql -U fbadmin -d facebook_data -c "SELECT COUNT(*) FROM posts;"
```

### Watch API Logs (Real-time)
```bash
docker-compose logs -f api
```

### Watch Database Logs
```bash
docker-compose logs -f postgres
```

---

## 🎯 BENEFITS:

| Before (Direct DB) | After (API-Based) |
|-------------------|-------------------|
| ❌ Auth errors | ✅ Zero auth errors |
| ❌ Complex setup | ✅ Simple HTTP requests |
| ❌ Port 5432 exposed | ✅ Only API port exposed |
| ❌ Password in scraper | ✅ No credentials needed |
| ❌ Host→Docker connection issues | ✅ Clean HTTP API |

---

## 📝 NEXT STEPS:

1. ✅ Pull latest code
2. ✅ Start Docker: `docker-compose up -d`
3. ✅ Verify API: `curl http://localhost:3000/health`
4. ✅ Run scraper: `node facebookkey.js`
5. ✅ Check dashboard: http://localhost:8080

**Selamat! Gak ada lagi error database authentication!** 🎉

---

## ❓ FAQ:

**Q: Apakah CSV/JSON masih dibuat?**
A: Ya! Scraper tetap save ke CSV/JSON sebagai backup.

**Q: Kalau API down, data hilang?**
A: Tidak! Data tetap save ke CSV/JSON. Tinggal import manual dengan POST /api/import

**Q: Bisa pakai API di port lain (e.g. 3002)?**
A: Bisa! Edit .env: `API_BASE_URL=http://localhost:3002`

**Q: Apakah perlu install PostgreSQL di host machine?**
A: TIDAK! PostgreSQL cuma running di Docker. Host cuma perlu HTTP client (axios).

**Q: Performance lebih lambat via API?**
A: Sedikit overhead HTTP, tapi masih sangat cepat. Benefit: zero connection errors!

---

**DOCUMENTATION CREATED:** 2024-11-17
**AUTHOR:** Claude AI Assistant
**STATUS:** Production Ready ✅
