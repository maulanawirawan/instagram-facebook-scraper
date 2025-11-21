# 🔧 Fix Database Error - Super Simple!

## Masalah: "role 'fbadmin' does not exist"

Ini terjadi karena user database belum dibuat. **TIDAK PERLU RECREATE CONTAINER!**

---

## ✅ SOLUSI TERCEPAT (Windows):

### Jalankan script ini:

```batch
fix-database.bat
```

**Script akan:**
1. Create user `fbadmin` di dalam container
2. Create database `facebook_data`
3. Create semua tables dari `init.sql`
4. Test koneksi

**SELESAI!** Gak perlu hapus volume atau recreate container!

---

## 🔧 Cara Manual (Jika script error):

### Step by step:

```batch
# 1. Check container running
docker ps

# 2. Create user fbadmin
docker exec -it facebook-postgres psql -U postgres -c "CREATE ROLE fbadmin WITH LOGIN PASSWORD 'fbpass123'; ALTER ROLE fbadmin CREATEDB;"

# 3. Create database
docker exec -it facebook-postgres psql -U postgres -c "CREATE DATABASE facebook_data OWNER fbadmin;"

# 4. Grant permissions
docker exec -it facebook-postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE facebook_data TO fbadmin;"

# 5. Create tables
docker exec -i facebook-postgres psql -U fbadmin -d facebook_data < database\init.sql

# 6. Test
node test-db-connection.js
```

---

## 🎯 Setelah Fix:

```batch
# Test connection
node test-db-connection.js

# Run scraper (auto-save to database!)
node facebookkey.js
```

---

## ❓ Kenapa Error Ini Terjadi?

Docker PostgreSQL seharusnya auto-create user dari `POSTGRES_USER` environment variable, tapi kadang gagal karena:
- Volume sudah ada sebelumnya
- Init script tidak jalan
- Environment variable tidak terbaca

**Solusi:** Script `fix-database.bat` langsung exec ke container dan create user manual, jadi **100% PASTI WORK!**

---

## 📊 Data Flow (Setelah Fix):

```
node facebookkey.js (Scraper)
    │
    ├──► CSV/JSON (Backup)
    │
    └──► PostgreSQL Database ✅ REAL-TIME!
            │
            ▼
        Backend API
            │
            ▼
        Dashboard (http://localhost:8080)
```

**Data langsung masuk database saat scraping, tidak perlu import manual!**

---

## 🆘 Troubleshooting:

### Error: "docker command not found"
- Install Docker Desktop
- Start Docker Desktop
- Run `docker ps` untuk verify

### Error: "container not running"
```batch
docker-compose up -d
```

### Error: "password authentication failed"
- Check file `.env`
- Pastikan `POSTGRES_PASSWORD=fbpass123`

### Masih error?
Run manual commands di section "Cara Manual" di atas satu per satu.

---

**SCRIPT SUDAH SIAP! Tinggal jalankan: `fix-database.bat`** 🚀
