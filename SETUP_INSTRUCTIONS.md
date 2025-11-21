# 🚀 Setup Instructions - Facebook Keyword Scraper

## 📋 Apa yang Sudah Diperbaiki?

### ✅ Masalah yang Diselesaikan:
1. **Error Code 28P01 (Authentication Failed)** - Fixed!
   - Port database salah (5433 → 5432) ✅
   - File `.env` tidak ada ✅
   - Konfigurasi database di `facebookkey.js` sudah diperbaiki ✅

2. **Real-time Database Auto-Save** - Ready!
   - `facebookkey.js` sudah support AUTO_SAVE_TO_DATABASE ✅
   - Data langsung masuk ke PostgreSQL saat scraping ✅
   - Tidak perlu import CSV/JSON manual lagi ✅

3. **Docker Setup Simplified** - Done!
   - Setup lebih sederhana: Database + API + Dashboard ✅
   - Backend API untuk serve data ke dashboard ✅
   - PostgreSQL + pgAdmin untuk manage data ✅

---

## 🔧 Cara Setup

### 1️⃣ Install Dependencies

```bash
# Install Node.js dependencies (jika belum)
npm install
```

### 2️⃣ Start Docker Containers

```bash
# Start semua services
docker-compose up -d

# Check status
docker ps

# Expected output:
# - facebook-postgres (PostgreSQL)
# - facebook-pgadmin (Database UI)
# - facebook-api (Backend API)
# - facebook-frontend (Dashboard)
```

### 3️⃣ Test Database Connection

```bash
# Test koneksi database
node test-db-connection.js
```

**Expected Output:**
```
✅ Connection successful!
📊 Database Info: ...
🔍 Tables found: posts, comments
📈 Data Statistics: ...
```

**Jika Error:**
- `ECONNREFUSED` → Docker belum running, jalankan `docker-compose up -d`
- `28P01` → Password salah, cek file `.env`
- `3D000` → Database belum dibuat, tunggu Docker init selesai

### 4️⃣ Run Facebook Scraper

```bash
# Jalankan scraper dengan auto-save ke database
node facebookkey.js
```

**Fitur Auto-Save:**
- ✅ Data langsung save ke PostgreSQL real-time
- ✅ Tetap save ke CSV/JSON sebagai backup
- ✅ Skip duplicate posts otomatis
- ✅ Update existing posts jika ada perubahan

---

## 🌐 Akses Dashboard & Tools

| Service | URL | Credentials |
|---------|-----|-------------|
| **Dashboard** | http://localhost:8080 | - |
| **API Backend** | http://localhost:3000 | - |
| **pgAdmin** | http://localhost:5050 | admin@facebook.local / admin123 |
| **PostgreSQL** | localhost:5432 | fbadmin / fbpass123 |

---

## 📊 Cara Kerja Real-Time Pipeline

```
┌─────────────────────┐
│  node facebookkey   │
│   (Scraper Bot)     │
└──────────┬──────────┘
           │
           ├──► Save to CSV/JSON (backup)
           │
           └──► Save to PostgreSQL (real-time)
                       │
                       ▼
           ┌───────────────────────┐
           │   PostgreSQL Database │
           └───────────┬───────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │    Backend API        │
           │   (Express.js)        │
           └───────────┬───────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │   Dashboard (HTML)    │
           │  Real-time Updates    │
           └───────────────────────┘
```

### Alur Data:

1. **`facebookkey.js` scraping Facebook**
   - Extract posts, comments, engagement
   - Clean & validate data

2. **Auto-save ke Database (Real-time)**
   - Function: `savePostToDatabase()` di line 2856
   - Function: `saveCommentsToDatabase()` di line 2928
   - Upsert: Update jika sudah ada, Insert jika baru

3. **Backend API fetch dari Database**
   - REST API endpoints untuk dashboard
   - Filter by date, query, engagement

4. **Dashboard display data**
   - Real-time updates
   - Charts, tables, analytics

---

## 🔍 Monitoring & Debugging

### Check Docker Logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f api
```

### Check Database Data:
```bash
# Via pgAdmin: http://localhost:5050
# Or via psql:
docker exec -it facebook-postgres psql -U fbadmin -d facebook_data

# Check tables
\dt

# Count posts
SELECT COUNT(*) FROM posts;

# Latest posts
SELECT author, text, timestamp FROM posts ORDER BY id DESC LIMIT 10;
```

### Check API Endpoints:
```bash
# Health check
curl http://localhost:3000/api/health

# Get posts
curl http://localhost:3000/api/posts

# Get stats
curl http://localhost:3000/api/stats
```

---

## ⚙️ Konfigurasi

### File `.env` (Sudah dibuat)
```env
# Database Connection
DB_HOST=localhost
DB_PORT=5432
DB_USER=fbadmin
DB_PASSWORD=fbpass123
DB_NAME=facebook_data

# Ports
POSTGRES_PORT=5432
PGADMIN_PORT=5050
API_PORT=3000
FRONTEND_PORT=8080
```

### File `facebookkey.js` Config (Line 97-103)
```javascript
AUTO_SAVE_TO_DATABASE: true,  // ✅ Enabled
DB_HOST: process.env.DB_HOST || 'localhost',
DB_PORT: parseInt(process.env.DB_PORT) || 5432,  // ✅ Fixed!
DB_USER: process.env.DB_USER || 'fbadmin',
DB_PASSWORD: process.env.DB_PASSWORD || 'fbpass123',
DB_NAME: process.env.DB_NAME || 'facebook_data',
```

---

## 🆘 Troubleshooting

### ❌ Error: "Connection refused"
**Penyebab:** Docker belum running
**Solusi:**
```bash
docker-compose up -d
docker ps  # Check if containers are running
```

### ❌ Error: "28P01 Authentication failed"
**Penyebab:** Password salah
**Solusi:**
1. Cek file `.env`, pastikan password match
2. Restart containers: `docker-compose restart`
3. Test connection: `node test-db-connection.js`

### ❌ Error: "Tables not found"
**Penyebab:** Database schema belum dibuat
**Solusi:**
```bash
# Wait for init.sql to run (automatic on first start)
docker-compose logs postgres

# Or manually run init:
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data < database/init.sql
```

### ❌ Data tidak muncul di dashboard
**Penyebab:** Backend belum fetch data baru
**Solusi:**
1. Cek API: `curl http://localhost:3000/api/posts`
2. Restart API: `docker-compose restart api`
3. Check logs: `docker-compose logs api`

---

## 🎯 Next Steps

1. ✅ Test connection: `node test-db-connection.js`
2. ✅ Start scraping: `node facebookkey.js`
3. ✅ Open dashboard: http://localhost:8080
4. ✅ Monitor pgAdmin: http://localhost:5050

---

## 📝 Notes

- **Auto-save sudah aktif** - Data langsung masuk ke database saat scraping
- **CSV/JSON tetap dibuat** - Sebagai backup
- **Duplicate handling** - Otomatis skip jika post sudah ada
- **Update support** - Update engagement metrics jika post sudah ada

Selamat mencoba! 🚀
