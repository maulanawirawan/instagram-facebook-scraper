# 📷 Instagram Auto-Save Setup Guide

Panduan lengkap untuk setup Instagram scraper dengan **auto-save ke database** (seperti Facebook).

---

## 🚀 STEP-BY-STEP COMMANDS

### **STEP 1: Pull Latest Code**

```bash
# Pull changes terbaru dari branch Instagram
git pull origin claude/complete-previous-task-01TCaxcpgYRRjaFPhrKvnKfZ

# ATAU kalau ada conflict, force pull:
git fetch origin claude/complete-previous-task-01TCaxcpgYRRjaFPhrKvnKfZ
git reset --hard origin/claude/complete-previous-task-01TCaxcpgYRRjaFPhrKvnKfZ
```

---

### **STEP 2: Setup Database**

```bash
# Masuk ke folder backend
cd backend

# Create Instagram tables di database
psql -U fbadmin -d facebook_data -f instagram_schema.sql

# Verify tables created successfully
psql -U fbadmin -d facebook_data -c "\dt instagram*"
# Expected output: instagram_posts, instagram_comments
```

---

### **STEP 3: Start Backend Server**

**Buka Terminal #1** (untuk backend server):

```bash
cd backend
npm start
```

**Expected output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Social Media Analytics API Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server running on: http://localhost:3002
🗄️  Database: facebook_data
🌐 Health check: http://localhost:3002/health

📊 Available endpoints:

   📷 INSTAGRAM:
   GET    /api/instagram/stats
   GET    /api/instagram/posts
   POST   /api/instagram/posts/save        ← AUTO-SAVE ENDPOINT
   GET    /api/instagram/comments
   POST   /api/instagram/comments/save     ← AUTO-SAVE ENDPOINT
   ...
```

**✅ JANGAN TUTUP TERMINAL INI - Biarkan server running!**

---

### **STEP 4: Integrate Auto-Save ke Scraper**

**Buka Terminal #2** (untuk edit scraper):

```bash
cd /path/to/facebook-keyword  # Adjust to your project folder

# Backup scraper original
cp apiscraperkeyword.js apiscraperkeyword.js.backup
```

**Edit `apiscraperkeyword.js`** - Tambahkan di bagian atas file (setelah `require` statements):

```javascript
// ADD THIS AT THE TOP (after existing requires):
const {
    saveInstagramPost,
    saveInstagramComments,
    batchSaveInstagramPosts,
    batchSaveInstagramComments,
    checkInstagramAPIHealth,
} = require('./instagram-db-config');
```

**Lalu cari bagian dimana post disimpan ke `allPosts.set()` dan tambahkan auto-save:**

```javascript
// FIND THIS CODE (around line 1598-1616):
if (!allPosts.has(post_pk)) {
    allPosts.set(post_pk, {
        post_pk: post_pk,
        post_code: post.code,
        post_url: `https://www.instagram.com/p/${post.code}/`,
        author_username: post.user?.username || post.owner?.username || "unknown",
        author_followers: 0,
        caption: post.caption?.text || "",
        timestamp_unix: post.taken_at,
        like_count: post.like_count || 0,
        comment_count: post.comment_count || 0,
        view_count: 0,
        share_count: "N/A",
        location: "N/A",
        audio_source: audioSource,
        query_used: null,
        hashtag_source: null,
        _processed_details: false
    });

    // ADD THIS LINE - Auto-save to database:
    await saveInstagramPost(allPosts.get(post_pk));

    totalPosts++;
}
```

**Dan cari bagian dimana comments disimpan:**

```javascript
// FIND THIS CODE (around line 1784-1794):
if (!allComments.has(comment_pk)) {
    allComments.set(comment_pk, {
        post_pk: post_pk,
        comment_pk: comment_pk,
        comment_author: comment.user?.username || "unknown",
        comment_text: comment.text || "",
        comment_likes: comment.comment_like_count || 0,
        comment_timestamp_unix: comment.created_at || 0,
        child_comment_count: comment.child_comment_count || 0,
        parent_comment_pk: null,
    });

    // ADD THIS LINE - Auto-save to database:
    await saveInstagramComments([allComments.get(comment_pk)]);
}
```

**Tambahkan health check di awal scraping** (sebelum mulai scrape):

```javascript
// ADD THIS in main function (before scraping starts):
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔌 Checking database connection...');
await checkInstagramAPIHealth();
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
```

---

### **STEP 5: Run Instagram Scraper**

**Buka Terminal #3** (untuk scraper):

```bash
cd /path/to/facebook-keyword

# Run Instagram scraper
node apiscraperkeyword.js
```

**Expected output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔌 Checking database connection...
✅ Instagram API connection successful!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[API HASHTAG] ✅ +5 posts dari search API
   ✅ DB: Post inserted - https://www.instagram.com/p/ABC123/
   ✅ DB: Post inserted - https://www.instagram.com/p/DEF456/
   ...

[API REST PARENT] ✅ 10 parent comments for post_pk: "12345"
   ✅ DB: Comments saved - 10 new, 0 updated
```

---

## 📊 Monitoring & Verification

### **Check Data in Database:**

```bash
# Total posts
psql -U fbadmin -d facebook_data -c "SELECT COUNT(*) FROM instagram_posts;"

# Total comments
psql -U fbadmin -d facebook_data -c "SELECT COUNT(*) FROM instagram_comments;"

# Recent posts
psql -U fbadmin -d facebook_data -c "SELECT author, likes, comments, post_url FROM instagram_posts ORDER BY id DESC LIMIT 10;"

# Top authors
psql -U fbadmin -d facebook_data -c "SELECT author, COUNT(*) as posts, SUM(likes) as total_likes FROM instagram_posts GROUP BY author ORDER BY posts DESC LIMIT 5;"
```

### **Open Dashboard:**

```
Browser: http://localhost:3002
Klik button "Instagram" di platform switcher
```

**Expected:**
- Statistics cards showing real-time data
- Charts populated with your scraped data
- Tables showing posts, comments, authors

---

## ⚙️ Configuration

Edit `instagram-db-config.js` untuk custom settings:

```javascript
const API_CONFIG = {
    BASE_URL: 'http://localhost:3002',  // Change if different port
    RETRY_ATTEMPTS: 3,                  // Retry on failure
    RETRY_DELAY: 2000,                  // Delay between retries (ms)
    BATCH_SIZE: 10,                     // Posts per batch
    ENABLE_AUTO_SAVE: true,             // Set to false to disable
};
```

---

## 🛠️ Troubleshooting

### **Problem: "Instagram API not available"**

**Solution:**
```bash
# Check if backend is running
curl http://localhost:3002/health

# If not running, start it:
cd backend && npm start
```

### **Problem: Database connection error**

**Solution:**
```bash
# Verify PostgreSQL is running
sudo systemctl status postgresql

# Test database connection
psql -U fbadmin -d facebook_data -c "SELECT 1;"

# Re-create tables if needed
cd backend
psql -U fbadmin -d facebook_data -f instagram_schema.sql
```

### **Problem: Posts not saving**

**Solution:**
```bash
# Check backend logs for errors
# Look at Terminal #1 where backend is running

# Test manual save:
curl -X POST http://localhost:3002/api/instagram/posts/save \
  -H "Content-Type: application/json" \
  -d '{"post_url":"https://www.instagram.com/p/test123/","author":"test","likes":100}'

# Expected: {"success":true,"action":"inserted",...}
```

---

## 📝 Complete Command Sequence (Quick Reference)

**Terminal #1 (Backend):**
```bash
cd backend
npm start
# Keep running...
```

**Terminal #2 (Database Setup - One Time Only):**
```bash
git pull origin claude/complete-previous-task-01TCaxcpgYRRjaFPhrKvnKfZ
cd backend
psql -U fbadmin -d facebook_data -f instagram_schema.sql
```

**Terminal #3 (Instagram Scraper):**
```bash
# Edit apiscraperkeyword.js (add require & auto-save calls)
# Then run:
node apiscraperkeyword.js
```

**Browser:**
```
http://localhost:3002
Click "Instagram" button
```

---

## ✅ Success Indicators

You'll know it's working when you see:

1. ✅ Backend shows: `Instagram API connection successful!`
2. ✅ Scraper shows: `DB: Post inserted - https://...`
3. ✅ Database query returns data: `SELECT COUNT(*) FROM instagram_posts;`
4. ✅ Dashboard shows statistics and charts
5. ✅ No errors in any terminal

---

## 🎯 Next Steps

Once setup is complete:

1. **Schedule Regular Scraping** - Use cron jobs or node-cron
2. **Monitor Database Growth** - Check disk space regularly
3. **Backup Data** - Regular PostgreSQL backups
4. **Optimize Queries** - Add indexes as needed
5. **Scale** - Add more scrapers or API endpoints

---

## 📞 Support

If you encounter issues:

1. Check all 3 terminals for error messages
2. Verify database connection
3. Test API endpoints manually with curl
4. Check `instagram-db-config.js` settings
5. Review scraper logs for API call failures

---

**Happy Scraping! 📷🚀**
