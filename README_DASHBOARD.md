# 📊 Facebook Analytics Dashboard

Full-stack web application untuk visualisasi data Facebook scraping dengan PostgreSQL database, REST API, dan interactive dashboard.

## 🎯 Features

- ✅ **PostgreSQL Database** dengan schema analytics
- ✅ **pgAdmin** untuk database management
- ✅ **REST API** dengan Express.js
- ✅ **Auto Import** CSV/JSON ke database
- ✅ **Interactive Dashboard** dengan charts & tables
- ✅ **Docker Compose** untuk easy deployment

## 🏗️ Architecture

```
┌─────────────┐
│  Browser    │
│  Dashboard  │ (http://localhost:8080)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   API       │
│  Express.js │ (http://localhost:3000)
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│ PostgreSQL  │◄────┤   pgAdmin    │
│  Database   │     │ Management   │
└─────────────┘     └──────────────┘
  (localhost:5432)    (localhost:5050)
```

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env if needed (optional)
nano .env
```

### 2. Start All Services

```bash
# Start PostgreSQL, pgAdmin, API, and Dashboard
docker-compose up -d

# View logs
docker-compose logs -f
```

### 3. Import Data

```bash
# Method 1: Via Docker
docker-compose exec api npm run import

# Method 2: Directly (if Node.js installed)
cd backend
npm install
npm run import
```

### 4. Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| **Dashboard** | http://localhost:8080 | No login required |
| **API** | http://localhost:3000 | No auth |
| **pgAdmin** | http://localhost:5050 | admin@facebook.local / admin123 |
| **PostgreSQL** | localhost:5432 | fbadmin / fbpass123 |

## 📁 Project Structure

```
facebook-keyword/
├── docker-compose.yml          # Docker orchestration
├── .env.example                # Environment template
│
├── database/
│   ├── init.sql                # PostgreSQL schema
│   └── import.js               # CSV/JSON importer
│
├── backend/
│   ├── package.json
│   ├── server.js               # Express API
│   └── Dockerfile
│
├── frontend/
│   ├── index.html              # Dashboard UI
│   ├── app.js                  # Frontend logic
│   ├── styles.css
│   └── Dockerfile
│
└── facebook_data/              # CSV/JSON files (auto-imported)
    ├── posts_2023.csv
    ├── posts_2023.json
    ├── comments.csv
    └── comments.json
```

## 📊 Database Schema

### Tables

**posts**
- Post information (author, text, timestamp)
- Engagement metrics (reactions, comments, shares, views)
- Media (image_url, video_url)
- Metadata (query_used, filter_year, location)

**comments**
- Comment information (author, text, timestamp)
- Engagement (reactions, replies)
- Post relationship (post_url, post_author)

### Views

- `v_top_authors` - Top authors by engagement
- `v_daily_stats` - Daily post statistics
- `v_query_stats` - Query performance
- `v_top_posts` - Top posts by engagement score
- `v_comment_activity` - Most active commenters

## 🔌 API Endpoints

### Statistics
```
GET /api/stats                    # Overall statistics
GET /api/stats/daily?limit=30     # Daily stats
GET /api/stats/queries            # Query performance
```

### Posts
```
GET /api/posts?page=1&limit=20    # Paginated posts
GET /api/posts/:id                # Single post + comments
GET /api/posts/top/engagement     # Top posts
GET /api/posts/search?q=keyword   # Search posts
```

### Comments
```
GET /api/comments?page=1&limit=50 # Paginated comments
GET /api/comments/top/authors     # Top commenters
```

### Authors
```
GET /api/authors/top?limit=10     # Top authors
GET /api/authors/:name            # Author profile
```

### Analytics
```
GET /api/analytics/trends?days=30 # Engagement trends
GET /api/analytics/hourly         # Posts by hour
GET /api/analytics/wordcloud      # Top words
```

## 🗄️ Connect to Database

### Via pgAdmin (Web UI)

1. Open http://localhost:5050
2. Login: `admin@facebook.local` / `admin123`
3. Add Server:
   - Name: Facebook DB
   - Host: `postgres` (or `localhost` if outside Docker)
   - Port: 5432
   - Username: `fbadmin`
   - Password: `fbpass123`

### Via psql (CLI)

```bash
# Inside Docker
docker-compose exec postgres psql -U fbadmin -d facebook_data

# From host (if psql installed)
psql -h localhost -U fbadmin -d facebook_data
```

### Example Queries

```sql
-- Total statistics
SELECT * FROM get_engagement_summary();

-- Top 10 authors
SELECT * FROM v_top_authors LIMIT 10;

-- Posts from specific query
SELECT author, text, reactions, comments
FROM posts
WHERE query_used = 'prabowo subianto'
ORDER BY reactions DESC
LIMIT 10;

-- Daily trends
SELECT * FROM v_daily_stats
WHERE date >= CURRENT_DATE - INTERVAL '7 days';
```

## 🔄 Data Import Process

The importer automatically:

1. ✅ Reads CSV/JSON files from `facebook_data/` folder
2. ✅ Checks for duplicates (by URL)
3. ✅ Inserts only new records
4. ✅ Updates statistics
5. ✅ Shows import summary

**Supported Files:**
- `posts_YYYY.csv` / `posts_YYYY.json`
- `comments.csv` / `comments.json`

**Re-import Safety:**
- Duplicate detection prevents double-importing
- Safe to run multiple times
- Only new data is imported

## 🛠️ Management Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f [service]

# Restart specific service
docker-compose restart api

# Import data
docker-compose exec api npm run import

# Access PostgreSQL CLI
docker-compose exec postgres psql -U fbadmin -d facebook_data

# Backup database
docker-compose exec postgres pg_dump -U fbadmin facebook_data > backup.sql

# Restore database
docker-compose exec -T postgres psql -U fbadmin -d facebook_data < backup.sql
```

## 📈 Dashboard Features

### Overview Tab
- Total posts, comments, reactions
- Engagement summary cards
- Recent posts table
- Quick statistics

### Analytics Tab
- Engagement trends chart
- Posts by hour chart
- Top authors chart
- Query performance

### Posts Tab
- Searchable posts table
- Filter by date, author, query
- Pagination
- Click to view details + comments

### Comments Tab
- All comments table
- Top commenters leaderboard
- Filter and search

## 🎨 Customize

### Change Ports

Edit `.env`:
```bash
POSTGRES_PORT=5432        # PostgreSQL
PGADMIN_PORT=5050         # pgAdmin
API_PORT=3000             # API
FRONTEND_PORT=8080        # Dashboard
```

### Add Custom Queries

Edit `backend/server.js` and add new endpoints:

```javascript
app.get('/api/custom/my-query', async (req, res) => {
    const result = await pool.query('YOUR SQL HERE');
    res.json(result.rows);
});
```

### Modify Database Schema

Edit `database/init.sql` and recreate:

```bash
docker-compose down -v  # Remove old data
docker-compose up -d    # Recreate with new schema
```

## 🐛 Troubleshooting

### Database connection failed

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Import fails

```bash
# Check data folder exists
ls -la facebook_data/

# Check file format
head facebook_data/posts_2023.csv

# Run import with logs
docker-compose exec api npm run import 2>&1 | tee import.log
```

### Dashboard not loading

```bash
# Check API is running
curl http://localhost:3000/health

# Check API logs
docker-compose logs api

# Restart frontend
docker-compose restart frontend
```

### Port already in use

```bash
# Find process using port
lsof -i :3000

# Kill process or change port in .env
```

## 📝 Development

### Local Development (Without Docker)

```bash
# 1. Start PostgreSQL manually
# (or use docker-compose up -d postgres only)

# 2. Start API
cd backend
npm install
npm run dev

# 3. Serve frontend
cd frontend
python3 -m http.server 8080
# or use any static file server
```

### Add New Features

1. **Backend**: Add endpoints in `backend/server.js`
2. **Frontend**: Update `frontend/index.html` and `frontend/app.js`
3. **Database**: Add views/functions in `database/init.sql`

## 🔐 Security Notes

⚠️ **This is for local development only!**

For production:
- Change all default passwords
- Add authentication/authorization
- Use HTTPS
- Add rate limiting
- Validate all inputs
- Use environment variables for secrets

## 📦 Backup & Export

### Export to CSV

```bash
# From pgAdmin: Right-click table → Import/Export
# Or via psql:
docker-compose exec postgres psql -U fbadmin -d facebook_data -c "\COPY posts TO '/tmp/posts_export.csv' CSV HEADER"
```

### Export to JSON

```bash
# Via API
curl http://localhost:3000/api/posts?limit=1000 > posts.json
curl http://localhost:3000/api/comments?limit=5000 > comments.json
```

## 🎓 Learn More

- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Express.js Docs](https://expressjs.com/)
- [Docker Compose Docs](https://docs.docker.com/compose/)
- [Chart.js Docs](https://www.chartjs.org/docs/)

## 📞 Support

Jika ada masalah:
1. Check logs: `docker-compose logs -f`
2. Check health: `curl http://localhost:3000/health`
3. Restart services: `docker-compose restart`
4. Reset all: `docker-compose down -v && docker-compose up -d`

---

Made with ❤️ for Facebook Data Analytics
