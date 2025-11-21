// facebook.js (Versi 8.0 - API-BASED AUTO-SAVE + TIMESTAMP FIX + MULTI CSV)
// ✅ Load environment variables from .env file FIRST
require('dotenv').config();

const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { createObjectCsvWriter } = require('csv-writer');
const csvParser = require('csv-parser');
const fs = require('fs');
const axios = require('axios');

// ======== KONFIGURASI ========
const CONFIG = {
    // Credentials (nanti bisa dienkripsi)
    fb_username: "catharinawijaya36@gmail.com",
    fb_password: "UrLoVeRUrB@Ebook",
    
    // Query
    query_variations: ["prabowo subianto", "anies baswedan", "jokowi", "politik indonesia"],
    
    // ✅ HISTORICAL - Target total ~1000 posts untuk SEMUA query + 3 tahun
    // Formula: 85 posts/year × 3 years × 4 queries = ~1020 total posts
    max_posts_historical: 85,  // 85 posts per year (balanced across all queries)

    // ✅ RECENT - Sustainable untuk 24/7
    max_posts_recent: 200,       // 200 posts per query untuk recent mode

    // ✅ TIMING - Balanced speed & safety
    JEDA_SCROLL_DETIK: 5,       // 5 detik per scroll (faster than 8s)
    JEDA_ANTAR_QUERY_MENIT: 3,  // 3 menit antar query (reasonable)
    JEDA_ANTAR_SIKLUS_MENIT: 30, // 30 menit antar siklus
    JEDA_UPDATE_MENIT: 30,      // 30 menit untuk update engagement
    
    // ✅ UPDATE - Lebih banyak sekaligus
    UPDATE_BATCH_SIZE: 40,      // ⬆️ dari 20 → 40 (more efficient)
    
    // CSV Settings
    csv_base_folder: "./facebook_data",
    csv_historical_prefix: "posts_",
    csv_recent_filename: "recent_posts.csv",
    
    // Debug & Filter
    DEBUG_MODE: false,

    // ✅ Hybrid Mode: GraphQL API + HTML Scraping
    USE_HYBRID_MODE: true,        // Enable GraphQL + HTML hybrid
    PREFER_GRAPHQL: true,          // Try GraphQL first
    COMPLEMENT_WITH_HTML: true,    // Use HTML to fill missing fields

    // ✅ Comment Extraction Settings
    EXTRACT_COMMENTS: true,        // ✅ ENABLED: GraphQL comment extraction active
    MAX_COMMENTS_PER_POST: 50,     // Max parent comments to extract
    MAX_NESTED_REPLIES: 10,        // Max nested replies per parent comment
    COMMENT_CSV_FILENAME: "comments.csv",  // Separate CSV for comments
    COMMENT_HOVER_RETRY: 2,        // Retry count for timestamp hover
    COMMENT_HOVER_DELAY: 2000,     // Hover delay in ms (increased for better reliability)

    // ✅ Resume functionality
    PROGRESS_FILE: './scraping_progress.json',
    CACHE_FILE: './scraped_urls_cache.json',
    USE_DATE_FILTER: true,
    FILTER_YEARS: [2023, 2024, 2025],
    SKIP_HISTORICAL: false,
    CUTOFF_DATE: '2023-05-01',
    FIRST_RUN_FILE: 'first_run_done.flag',
    MAX_SAME_POSTS_SCROLL: 6,  // Increase from 3 to 6 (less likely to get stuck on duplicates)
    
    // ✅ NEW: ERROR HANDLING & RETRY
    MAX_RETRIES: 3,              // Retry 3x jika error
    RETRY_DELAY_MINUTES: 5,      // Jeda 5 menit sebelum retry
    COOLDOWN_ON_ERROR: 15,       // Cooldown 15 menit jika max retry
    
    // ✅ NEW: RATE LIMITING
    MAX_REQUESTS_PER_HOUR: 500,  // Max 500 requests per jam
    
    // ✅ NEW: BACKUP SYSTEM
    BACKUP_ENABLED: true,
    BACKUP_DIR: './backups',
    BACKUP_INTERVAL_HOURS: 6,    // Backup setiap 6 jam
    BACKUP_KEEP_DAYS: 7,         // Simpan backup 7 hari terakhir
    
    // ✅ NEW: LOGGING
    LOG_DIR: './logs',
    LOG_LEVEL: 'INFO',           // DEBUG, INFO, WARN, ERROR
    
    // ✅ NEW: FILE PERMISSIONS
    FILE_PERMISSIONS: 0o664,     // rw-rw-r--
    
    // ✅ NEW: SCREENSHOT ON ERROR
    SCREENSHOT_ON_ERROR: true,
    SCREENSHOT_DIR: './screenshots',
    MAX_SCREENSHOTS: 50,         // Keep last 50 screenshots only

    // ✅ NEW: RECENT POSTS UPDATE SETTINGS
    UPDATE_RECENT_POSTS: true,           // Enable auto-update after scraping
    UPDATE_RECENT_DAYS: 30,              // Only update posts from last N days
    UPDATE_RECENT_DELAY_MS: 5000,        // Delay between updates (5 seconds)
    UPDATE_RECENT_SHOW_DELTA: true,      // Show delta in console (+100, -50, etc)
    UPDATE_ERROR_DIR: './update_errors', // Error screenshots folder

    // ✅ ZOOM SETTING - untuk timestamp dan layout issues
    PAGE_ZOOM: 0.5,              // 50% zoom (0.5 = 50%, 1.0 = 100%)

    // ✅ API-BASED AUTO-SAVE - Save to database via API (no direct DB connection needed!)
    AUTO_SAVE_TO_DATABASE: true, // Enable auto-save to database via API
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000', // Backend API URL
    API_TIMEOUT: 10000, // 10 seconds timeout for API requests
};

// ✅ SMART API CONNECTION CHECK - Auto-detect & Fallback
let isApiAvailable = false;

/**
 * Smart API Detection - Try multiple URLs with fallback
 * Supports: localhost, 127.0.0.1, LAN IP, custom ports
 */
async function detectApiConnection() {
    if (!CONFIG.AUTO_SAVE_TO_DATABASE) {
        return false;
    }

    // Get port from env or use default
    const apiPort = process.env.API_PORT || '3002';

    // Get LAN IP from network interfaces
    const networkInterfaces = os.networkInterfaces();
    const lanIPs = [];
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (!net.internal && net.family === 'IPv4') {
                lanIPs.push(net.address);
            }
        }
    }

    // Try multiple URL candidates in priority order
    const urlCandidates = [
        process.env.API_BASE_URL,            // User-defined URL from .env (highest priority)
        `http://127.0.0.1:${apiPort}`,      // IPv4 localhost (most reliable)
        `http://localhost:${apiPort}`,       // System localhost (may use IPv6)
        ...lanIPs.map(ip => `http://${ip}:${apiPort}`), // LAN IPs (for Docker/remote access)
    ].filter(Boolean); // Remove undefined

    console.log('🔍 Detecting API connection...');

    for (const url of urlCandidates) {
        try {
            const response = await axios.get(`${url}/health`, {
                timeout: 3000,
                family: 4 // Force IPv4
            });

            // Success! Update config and return
            CONFIG.API_BASE_URL = url;
            console.log('✅ API connected:', response.data.database);
            console.log(`   API URL: ${url}`);
            return true;
        } catch (err) {
            // Try next candidate
            continue;
        }
    }

    // All candidates failed
    console.error('❌ API connection failed - tried:', urlCandidates.join(', '));
    console.log('   ⚠️  Will save to CSV only (API disabled)');
    console.log(`   ⚠️  Make sure backend is running: docker-compose up -d api`);
    return false;
}

// Run API detection on startup
if (CONFIG.AUTO_SAVE_TO_DATABASE) {
    detectApiConnection().then(available => {
        isApiAvailable = available;
    });
}

let isJobRunning = false;
let allScrapedUrls = new Set();
let isFirstRunDone = false;

// ✅ RESUME STATE
let resumeState = {
    currentQueryIndex: 0,
    currentYearIndex: 0,
    inHistoricalMode: false,
    lastSavedAt: null
};

// ======== ✅ STRATEGY TRACKING SYSTEM - AUTO UPDATE ========
const strategyStats = {
    reactions: {},
    comments: {},
    shares: {},
    views: {},
    timestamp: {},
    location: {},
    url: {},
    author: {},
    content: {},
    data_source: {}  // ✅ NEW: Track GraphQL vs HTML
};

let totalPostsProcessed = 0; // Track total posts untuk report

/**
 * ✅ Set page zoom level
 */
async function setPageZoom(page, zoomLevel = CONFIG.PAGE_ZOOM) {
    try {
        await page.evaluate((zoom) => {
            document.body.style.zoom = zoom;
        }, zoomLevel);
        console.log(`🔍 Page zoom set to ${Math.round(zoomLevel * 100)}%`);
    } catch (error) {
        console.error('❌ Error setting page zoom:', error.message);
    }
}

/**
 * ✅ Track strategy usage (HANYA LOG, TIDAK UBAH LOGIC)
 */
function trackStrategy(category, strategyName) {
    if (!strategyStats[category]) {
        strategyStats[category] = {};
    }
    if (!strategyStats[category][strategyName]) {
        strategyStats[category][strategyName] = 0;
    }
    strategyStats[category][strategyName]++;
}

/**
 * ✅ Save strategy report (AUTO-UPDATE FILE)
 */
function saveStrategyReport() {
    try {
        const reportData = {
            generated_at: new Date().toISOString(),
            total_posts_processed: totalPostsProcessed,
            total_cycles: stats.cycleCount,
            summary: {},
            detailed: strategyStats,
            recommendations: {}
        };
        
        // Generate summary per category
        for (const [category, strategies] of Object.entries(strategyStats)) {
            const entries = Object.entries(strategies);
            const total = entries.reduce((sum, [_, count]) => sum + count, 0);
            
            if (total === 0) continue;
            
            entries.sort((a, b) => b[1] - a[1]);
            
            const topStrategy = entries[0];
            const unusedStrategies = entries.filter(([_, count]) => {
                const percentage = (count / total) * 100;
                return percentage < 5;
            }).map(([name, count]) => ({ name, count, percentage: ((count/total)*100).toFixed(1) }));
            
            reportData.summary[category] = {
                total_uses: total,
                total_strategies: entries.length,
                most_used: {
                    name: topStrategy[0],
                    count: topStrategy[1],
                    percentage: ((topStrategy[1] / total) * 100).toFixed(1) + '%'
                },
                top_3: entries.slice(0, 3).map(([name, count]) => ({
                    name,
                    count,
                    percentage: ((count/total)*100).toFixed(1) + '%'
                })),
                unused_count: unusedStrategies.length,
                candidates_for_removal: unusedStrategies
            };
            
            // Recommendations
            const keepStrategies = entries.filter(([_, count]) => (count/total)*100 >= 20).map(([name]) => name);
            const reviewStrategies = entries.filter(([_, count]) => {
                const pct = (count/total)*100;
                return pct >= 5 && pct < 20;
            }).map(([name]) => name);
            const removeStrategies = unusedStrategies.map(s => s.name);
            
            reportData.recommendations[category] = {
                keep: keepStrategies,
                review: reviewStrategies,
                remove: removeStrategies
            };
        }
        
        // Save JSON (for machine reading)
        const jsonFile = './strategy_report.json';
        fs.writeFileSync(jsonFile, JSON.stringify(reportData, null, 2));
        fs.chmodSync(jsonFile, CONFIG.FILE_PERMISSIONS);
        
        // Save TXT (for human reading)
        const txtFile = './strategy_report.txt';
        let txtContent = `
╔═══════════════════════════════════════════════════════════════════╗
║              📊 STRATEGY USAGE REPORT                            ║
║              Auto-generated: ${new Date().toLocaleString('id-ID')}           
╚═══════════════════════════════════════════════════════════════════╝

📈 OVERVIEW
─────────────────────────────────────────────────────────────────────
Total Posts Processed: ${totalPostsProcessed}
Total Cycles Completed: ${stats.cycleCount}
Report Generated: ${reportData.generated_at}

`;

        for (const [category, summary] of Object.entries(reportData.summary)) {
            txtContent += `
╔═══════════════════════════════════════════════════════════════════╗
║  📌 ${category.toUpperCase().padEnd(62)} ║
╚═══════════════════════════════════════════════════════════════════╝

📊 Statistics:
   • Total Uses: ${summary.total_uses}
   • Total Strategies: ${summary.total_strategies}
   • Unused Strategies: ${summary.unused_count}

🏆 Top 3 Most Used:
`;
            summary.top_3.forEach((strat, i) => {
                const bar = "█".repeat(Math.floor(parseFloat(strat.percentage) / 2));
                txtContent += `   ${i+1}. ${strat.name.padEnd(40)} ${strat.count.toString().padStart(5)} (${strat.percentage.padStart(5)}%) ${bar}\n`;
            });
            
            const recs = reportData.recommendations[category];
            
            if (recs.keep.length > 0) {
                txtContent += `\n✅ KEEP (≥20% usage):\n`;
                recs.keep.forEach(name => txtContent += `   • ${name}\n`);
            }
            
            if (recs.review.length > 0) {
                txtContent += `\n⚠️  REVIEW (5-20% usage):\n`;
                recs.review.forEach(name => txtContent += `   • ${name}\n`);
            }
            
            if (recs.remove.length > 0) {
                txtContent += `\n❌ CANDIDATES FOR REMOVAL (<5% usage):\n`;
                recs.remove.forEach(name => txtContent += `   • ${name}\n`);
            }
        }
        
        txtContent += `
─────────────────────────────────────────────────────────────────────
Legend:
  ✅ KEEP     - Used ≥20% (core strategy, definitely keep)
  ⚠️  REVIEW   - Used 5-20% (consider keeping for edge cases)
  ❌ REMOVE?  - Used <5% (safe to remove, rarely used)
─────────────────────────────────────────────────────────────────────

💡 TIP: Strategies marked "REMOVE" dapat dihapus untuk simplify code.
        Backup code sebelum menghapus!
`;
        
        fs.writeFileSync(txtFile, txtContent);
        fs.chmodSync(txtFile, CONFIG.FILE_PERMISSIONS);
        
        console.log(`💾 Strategy report updated:`);
        console.log(`   • JSON: ${jsonFile}`);
        console.log(`   • TXT:  ${txtFile}`);
        
    } catch (e) {
        console.error(`❌ Failed to save strategy report: ${e.message}`);
    }
}

/**
 * ✅ SAVE PROGRESS STATE - For resume functionality
 */
function saveProgress() {
    try {
        const progressData = {
            resumeState: resumeState,
            isFirstRunDone: isFirstRunDone,
            stats: stats,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progressData, null, 2));
        console.log(`   💾 Progress saved to ${CONFIG.PROGRESS_FILE}`);

        // Save URL cache
        const cacheData = {
            urls: Array.from(allScrapedUrls),
            count: allScrapedUrls.size,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(CONFIG.CACHE_FILE, JSON.stringify(cacheData, null, 2));
        console.log(`   💾 Cache saved: ${allScrapedUrls.size} URLs`);

    } catch (e) {
        console.error(`   ⚠️ Failed to save progress: ${e.message}`);
    }
}

/**
 * ✅ LOAD PROGRESS STATE - Resume from last position
 */
function loadProgress() {
    try {
        // Load progress state
        if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
            const progressData = JSON.parse(fs.readFileSync(CONFIG.PROGRESS_FILE, 'utf8'));

            resumeState = progressData.resumeState || resumeState;
            isFirstRunDone = progressData.isFirstRunDone || false;

            // Restore stats
            if (progressData.stats) {
                Object.assign(stats, progressData.stats);
            }

            const timeSince = progressData.timestamp
                ? Math.round((Date.now() - new Date(progressData.timestamp).getTime()) / 1000 / 60)
                : 'unknown';

            console.log(`\n🔄 RESUME MODE ACTIVATED`);
            console.log(`   📍 Last position: Query ${resumeState.currentQueryIndex + 1}/${CONFIG.query_variations.length}`);
            if (resumeState.inHistoricalMode) {
                console.log(`   📅 Historical mode: Year index ${resumeState.currentYearIndex}`);
            }
            console.log(`   ⏱️  Last saved: ${timeSince} minutes ago`);
            console.log(`   📊 Stats: ${stats.totalScraped} posts, ${stats.cycleCount} cycles\n`);
        }

        // Load URL cache
        if (fs.existsSync(CONFIG.CACHE_FILE)) {
            const cacheData = JSON.parse(fs.readFileSync(CONFIG.CACHE_FILE, 'utf8'));

            allScrapedUrls = new Set(cacheData.urls || []);
            console.log(`   ✅ Loaded ${allScrapedUrls.size} cached URLs\n`);
        }

    } catch (e) {
        console.error(`   ⚠️ Failed to load progress: ${e.message}`);
        console.log(`   ℹ️  Starting fresh...`);
    }
}

/**
 * ✅ CLEAR PROGRESS STATE - Start fresh
 */
function clearProgress() {
    try {
        if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
            fs.unlinkSync(CONFIG.PROGRESS_FILE);
            console.log(`   🗑️  Progress file cleared`);
        }

        resumeState = {
            currentQueryIndex: 0,
            currentYearIndex: 0,
            inHistoricalMode: false,
            lastSavedAt: null
        };

    } catch (e) {
        console.error(`   ⚠️ Failed to clear progress: ${e.message}`);
    }
}

/**
 * ✅ UPDATED: Create backup WITHOUT cache file
 */
async function createBackup() {
    if (!CONFIG.BACKUP_ENABLED) return;
    
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                         new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
        const backupFolder = path.join(CONFIG.BACKUP_DIR, `backup_${timestamp}`);
        
        // Create backup folder
        if (!fs.existsSync(backupFolder)) {
            fs.mkdirSync(backupFolder, { recursive: true });
        }
        
        let backedUpFiles = 0;
        
        // ========== BACKUP CSV FILES ==========
        if (fs.existsSync(CONFIG.csv_base_folder)) {
            const csvFiles = fs.readdirSync(CONFIG.csv_base_folder)
                .filter(f => f.endsWith('.csv'));
            
            console.log(`      • CSV files: ${csvFiles.length} files`);
            
            for (const file of csvFiles) {
                const src = path.join(CONFIG.csv_base_folder, file);
                const dest = path.join(backupFolder, file);
                
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, dest);
                    fs.chmodSync(dest, CONFIG.FILE_PERMISSIONS);
                    backedUpFiles++;
                }
            }
        }
        
        
        // ========== BACKUP STATS FILE ==========
        if (fs.existsSync('./stats.json')) {
            fs.copyFileSync('./stats.json', path.join(backupFolder, 'stats.json'));
            fs.chmodSync(path.join(backupFolder, 'stats.json'), CONFIG.FILE_PERMISSIONS);
            backedUpFiles++;
            console.log(`      • Stats file: BACKED UP`);
        }
        
        console.log(`✅ Backup created: ${backupFolder} (${backedUpFiles} files)`);
        
        // Clean old backups
        cleanOldBackups(CONFIG.BACKUP_KEEP_DAYS);
        
    } catch (e) {
        console.error(`❌ Backup failed: ${e.message}`);
    }
}

/**
 * ✅ NEW: Remove backups older than N days
 */
function cleanOldBackups(keepDays) {
    try {
        if (!fs.existsSync(CONFIG.BACKUP_DIR)) return;
        
        const backups = fs.readdirSync(CONFIG.BACKUP_DIR)
            .filter(f => f.startsWith('backup_'))
            .map(f => ({
                name: f,
                path: path.join(CONFIG.BACKUP_DIR, f),
                time: fs.statSync(path.join(CONFIG.BACKUP_DIR, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);
        
        const cutoffTime = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
        let removed = 0;
        
        backups.forEach(backup => {
            if (backup.time < cutoffTime) {
                fs.rmSync(backup.path, { recursive: true, force: true });
                removed++;
            }
        });
        
        if (removed > 0) {
            console.log(`🧹 Cleaned ${removed} old backup(s)`);
        }
        
    } catch (e) {
        console.error(`⚠️ Backup cleanup failed: ${e.message}`);
    }
}

/**
 * ✅ NEW: Enhanced logging with levels and file output
 */
function log(level, message, data = {}) {
    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    const configLevel = levels[CONFIG.LOG_LEVEL] || 1;
    
    if (levels[level] < configLevel) return; // Skip if below threshold
    
    const timestamp = new Date().toISOString();
    const emoji = { DEBUG: '🔍', INFO: 'ℹ️', WARN: '⚠️', ERROR: '❌' }[level] || 'ℹ️';
    
    // Console output
    console.log(`${emoji} [${timestamp}] [${level}] ${message}`);
    if (Object.keys(data).length > 0) {
        console.log('   Data:', JSON.stringify(data, null, 2));
    }
    
    // File output
    try {
        if (!fs.existsSync(CONFIG.LOG_DIR)) {
            fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
        }
        
        const logFile = path.join(CONFIG.LOG_DIR, `scraper_${new Date().toISOString().split('T')[0]}.log`);
        const logEntry = JSON.stringify({ timestamp, level, message, ...data }) + '\n';
        
        fs.appendFileSync(logFile, logEntry);
        
        // Rotate log files (keep last 30 days)
        rotateLogs(30);
        
    } catch (e) {
        console.error(`Log write failed: ${e.message}`);
    }
}

/**
 * ✅ NEW: Rotate old log files
 */
function rotateLogs(keepDays) {
    try {
        if (!fs.existsSync(CONFIG.LOG_DIR)) return;
        
        const logs = fs.readdirSync(CONFIG.LOG_DIR)
            .filter(f => f.startsWith('scraper_') && f.endsWith('.log'))
            .map(f => ({
                name: f,
                path: path.join(CONFIG.LOG_DIR, f),
                time: fs.statSync(path.join(CONFIG.LOG_DIR, f)).mtime.getTime()
            }));
        
        const cutoffTime = Date.now() - (keepDays * 24 * 60 * 60 * 1000);
        
        logs.forEach(log => {
            if (log.time < cutoffTime) {
                fs.unlinkSync(log.path);
            }
        });
        
    } catch (e) {
        // Silent fail untuk log rotation
    }
}


/**
 * ✅ NEW: Rate limiting tracker
 */
let requestsThisHour = 0;
let hourStartTime = Date.now();

async function checkRateLimit() {
    const now = Date.now();
    const hourElapsed = (now - hourStartTime) / (1000 * 60 * 60);
    
    // Reset counter setiap jam
    if (hourElapsed >= 1) {
        log('INFO', `Rate limit reset: ${requestsThisHour} requests in last hour`);
        requestsThisHour = 0;
        hourStartTime = now;
    }
    
    // Check if over limit
    if (requestsThisHour >= CONFIG.MAX_REQUESTS_PER_HOUR) {
        const waitTime = Math.ceil((1 - hourElapsed) * 60); // menit
        log('WARN', `Rate limit reached (${requestsThisHour}/${CONFIG.MAX_REQUESTS_PER_HOUR})`, {
            waitTime: `${waitTime} minutes`
        });
        
        console.log(`⏸️  Cooling down for ${waitTime} minutes...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 60 * 1000));
        
        requestsThisHour = 0;
        hourStartTime = Date.now();
    }
    
    requestsThisHour++;
}

/**
 * ✅ NEW: Screenshot on error with cleanup
 */
async function captureErrorScreenshot(page, errorContext, postIndex = null) {
    if (!CONFIG.SCREENSHOT_ON_ERROR) return null;
    
    try {
        if (!fs.existsSync(CONFIG.SCREENSHOT_DIR)) {
            fs.mkdirSync(CONFIG.SCREENSHOT_DIR, { recursive: true });
        }
        
        const timestamp = Date.now();
        const postInfo = postIndex !== null ? `_post${postIndex}` : '';
        const filename = path.join(
            CONFIG.SCREENSHOT_DIR, 
            `error_${errorContext}${postInfo}_${timestamp}.png`
        );
        
        await page.screenshot({ path: filename, fullPage: false });
        fs.chmodSync(filename, CONFIG.FILE_PERMISSIONS);
        
        log('DEBUG', `Screenshot captured: ${filename}`);
        
        // Cleanup old screenshots
        const screenshots = fs.readdirSync(CONFIG.SCREENSHOT_DIR)
            .filter(f => f.startsWith('error_') && f.endsWith('.png'))
            .map(f => ({
                name: f,
                path: path.join(CONFIG.SCREENSHOT_DIR, f),
                time: fs.statSync(path.join(CONFIG.SCREENSHOT_DIR, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);
        
        // Keep only last N screenshots
        if (screenshots.length > CONFIG.MAX_SCREENSHOTS) {
            screenshots.slice(CONFIG.MAX_SCREENSHOTS).forEach(s => {
                fs.unlinkSync(s.path);
            });
        }
        
        return filename;
        
    } catch (e) {
        log('WARN', `Screenshot failed: ${e.message}`);
        return null;
    }
}

/**
 * ✅ NEW: Wrap runJob with retry mechanism
 */
async function runJobWithRetry() {
    let retries = 0;
    
    while (retries < CONFIG.MAX_RETRIES) {
        try {
            log('INFO', `Starting job (attempt ${retries + 1}/${CONFIG.MAX_RETRIES})`);
            await runJob();
            log('INFO', 'Job completed successfully');
            return true; // Success
            
        } catch (error) {
            retries++;
            log('ERROR', `Job failed (attempt ${retries}/${CONFIG.MAX_RETRIES})`, {
                error: error.message,
                stack: error.stack?.substring(0, 300)
            });
            
            if (retries < CONFIG.MAX_RETRIES) {
                const delay = CONFIG.RETRY_DELAY_MINUTES * 60 * 1000;
                console.log(`🔄 Retrying in ${CONFIG.RETRY_DELAY_MINUTES} minutes...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                log('ERROR', 'Max retries reached, entering cooldown', {
                    cooldown: `${CONFIG.COOLDOWN_ON_ERROR} minutes`
                });
                
                console.error(`💥 Max retries reached. Cooldown for ${CONFIG.COOLDOWN_ON_ERROR} minutes...`);
                await new Promise(resolve => 
                    setTimeout(resolve, CONFIG.COOLDOWN_ON_ERROR * 60 * 1000)
                );
            }
        }
    }
    
    return false;
}


/**
 * ✅ NEW: Statistics tracking
 */
const stats = {
    startTime: Date.now(),
    totalScraped: 0,
    totalErrors: 0,
    totalRetries: 0,
    lastSuccessfulRun: null,
    lastErrorTime: null,
    cycleCount: 0,
    postsPerCycle: [],
    errorsPerCycle: []
};

/**
 * ✅ NEW: Save stats to file
 */
function saveStats() {
    try {
        const uptime = Date.now() - stats.startTime;
        const statsData = {
            ...stats,
            uptimeHours: (uptime / (1000 * 60 * 60)).toFixed(2),
            uptimeDays: (uptime / (1000 * 60 * 60 * 24)).toFixed(2),
            avgPostsPerCycle: stats.postsPerCycle.length > 0 
                ? (stats.postsPerCycle.reduce((a, b) => a + b, 0) / stats.postsPerCycle.length).toFixed(2)
                : 0,
            successRate: stats.cycleCount > 0
                ? ((stats.cycleCount - stats.totalRetries) / stats.cycleCount * 100).toFixed(2) + '%'
                : '0%',
            lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync('./stats.json', JSON.stringify(statsData, null, 2));
        fs.chmodSync('./stats.json', CONFIG.FILE_PERMISSIONS);
        
    } catch (e) {
        log('WARN', `Stats save failed: ${e.message}`);
    }
}

/**
 * ✅ NEW: Update stats after each cycle
 */
function updateStats(scraped, errors) {
    stats.cycleCount++;
    stats.totalScraped += scraped;
    stats.totalErrors += errors;
    
    if (scraped > 0) {
        stats.lastSuccessfulRun = new Date().toISOString();
    }
    
    stats.postsPerCycle.push(scraped);
    stats.errorsPerCycle.push(errors);
    
    // Keep only last 100 cycles
    if (stats.postsPerCycle.length > 100) {
        stats.postsPerCycle.shift();
        stats.errorsPerCycle.shift();
    }
    
    saveStats();
}


// Pastikan folder exists
if (!fs.existsSync(CONFIG.csv_base_folder)) {
    fs.mkdirSync(CONFIG.csv_base_folder, { recursive: true });
}

/**
 * ✅ FIXED: Clean text untuk CSV - AGGRESSIVE newline removal
 */
function cleanTextForCSV(text) {
    if (!text) return "";
    
    let cleaned = String(text)
        // Remove ALL types of line breaks
        .replace(/[\r\n\t\v\f\u2028\u2029]+/g, ' ')
        // Remove multiple spaces
        .replace(/\s+/g, ' ')
        // Remove zero-width characters
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        // Remove control characters (except space)
        .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
        .trim();
    
    // Escape double quotes untuk CSV
    cleaned = cleaned.replace(/"/g, '""');
    
    return cleaned;
}

/**
 * ✅ Normalize Facebook URL - Fix double prefix issue
 * Handles both absolute URLs (https://www.facebook.com/...) and relative URLs (/profile.php?id=...)
 */
function normalizeFacebookUrl(href) {
    if (!href || href === 'N/A') return 'N/A';

    // Clean the href first - remove tracking parameters
    let cleanHref = href.split('&__cft__')[0].split('&__tn__')[0].split('?')[0];

    // If already starts with http:// or https://, use as-is (it's an absolute URL)
    if (cleanHref.startsWith('http://') || cleanHref.startsWith('https://')) {
        return cleanHref;
    }

    // If it's a relative URL (starts with /), add the Facebook domain
    if (cleanHref.startsWith('/')) {
        return 'https://www.facebook.com' + cleanHref;
    }

    // Otherwise, assume it needs the full prefix
    return 'https://www.facebook.com/' + cleanHref;
}

/**
 * Parse engagement count
 */
function parseEngagementCount(text) {
    if (!text) return 0;
    const lowerText = text.toLowerCase().replace(',', '.');
    const match = lowerText.match(/(\d+(\.\d+)?)/);
    if (!match) return 0;

    let count = parseFloat(match[0]);
    if (lowerText.includes('k') || lowerText.includes('rb')) {
        count *= 1000;
    } else if (lowerText.includes('m') || lowerText.includes('jt')) {
        count *= 1000000;
    }
    return Math.round(count);
}

/**
 * Clean URL tapi pertahankan parameter penting (fbid untuk foto)
 */
function cleanPostUrl(url) {
    if (!url) return url;
    
    // ✅ Keep share links intact (new Facebook format)
    if (url.includes('/share/v/') || url.includes('/share/p/') || url.includes('/share/r/')) {
        // Remove tracking params but keep the share ID
        return url.split('?')[0].split('&__cft__')[0].split('&__tn__')[0];
    }
    
    // ✅ Keep photo links with fbid parameter
    if (url.includes('/photo')) {
        return url.split('&__cft__')[0].split('&__tn__')[0];
    }
    
    // ✅ Keep reel/watch links with ID
    if (url.includes('/reel/') || url.includes('/watch/')) {
        return url.split('?')[0].split('&__cft__')[0].split('&__tn__')[0];
    }
    
    // Default: remove all query params
    return url.split('?')[0];
}


/**
 * ✅ Extract Post ID dari berbagai format URL Facebook
 */
function extractPostId(url) {
    if (!url) return null;
    
    try {
        const patterns = [
            // Format: /posts/pfbid...
            /\/posts\/(pfbid[\w-]+)/i,
            // Format: /photo/?fbid=123456
            /[?&]fbid=(\d+)/i,
            // Format: /photo.php?fbid=123456
            /photo\.php\?.*fbid=(\d+)/i,
            // Format: /videos/123456
            /\/videos\/(\d+)/i,
            // Format: /reel/123456
            /\/reel\/([\w-]+)/i,
            // Format: story_fbid=123456
            /story_fbid=(\d+)/i,
            // Format: /permalink/123456
            /\/permalink\/(\d+)/i,
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * ✅ Extract Photo ID dari image source URL
 */
function extractPhotoIdFromImageUrl(imageUrl) {
    if (!imageUrl || imageUrl === "N/A") return null;
    
    try {
        // Pattern: 555724480_1344276150399073_178885508552628349_n.jpg
        // Ambil angka tengah (1344276150399073) yang merupakan photo ID
        const match = imageUrl.match(/\/(\d+)_(\d+)_(\d+)_[no]\.jpg/i);
        if (match && match[2]) {
            return match[2]; // Return photo ID (angka tengah)
        }
        
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * ✅ FIXED: Find duplicate in CSV files with ROBUST parsing
 */
function findDuplicateInCSV(searchKey, searchValue) {
    const csvFiles = [
        ...CONFIG.FILTER_YEARS.map(y => getCSVFilename(y)),
        getCSVFilename(null)
    ].filter(f => fs.existsSync(f));
    
    for (const csvFile of csvFiles) {
        try {
            const fileContent = fs.readFileSync(csvFile, 'utf8');
            const lines = fileContent.split('\n');
            
            // Parse header to get column indices
            const headerLine = lines[0];
            const headers = headerLine.match(/"([^"]+)"|([^,]+)/g).map(h => h.replace(/"/g, '').trim());
            
            const postUrlIndex = headers.indexOf('post_url');
            const shareUrlIndex = headers.indexOf('share_url');
            const authorIndex = headers.indexOf('author');
            const timestampIndex = headers.indexOf('timestamp');
            const scrapedAtIndex = headers.indexOf('scraped_at');
            
            // Search in data rows
            for (let lineNum = 1; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                
                if (!line.trim() || line.length < 50) continue; // Skip empty lines
                
                // Quick check first (performance)
                if (!line.includes(searchValue)) continue;
                
                // Parse CSV row properly
                const values = [];
                let current = '';
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    
                    if (char === '"') {
                        if (inQuotes && line[i + 1] === '"') {
                            // Escaped quote
                            current += '"';
                            i++;
                        } else {
                            // Toggle quote mode
                            inQuotes = !inQuotes;
                        }
                    } else if (char === ',' && !inQuotes) {
                        // End of field
                        values.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                // Push last field
                values.push(current.trim());
                
                // Check if post_url matches
                const postUrl = values[postUrlIndex] || '';
                const shareUrl = values[shareUrlIndex] || '';
                
                if (postUrl.includes(searchValue) || shareUrl.includes(searchValue)) {
                    return {
                        found: true,
                        file: csvFile,
                        lineNumber: lineNum + 1, // +1 for header
                        author: values[authorIndex] || 'Unknown',
                        timestamp: values[timestampIndex] || 'N/A',
                        post_url: postUrl,
                        share_url: shareUrl,
                        scraped_at: values[scrapedAtIndex] || 'N/A'
                    };
                }
            }
        } catch (e) {
            console.warn(`      ⚠️ Error reading ${csvFile}: ${e.message.substring(0, 40)}`);
            continue;
        }
    }
    
    return { found: false };
}

/**
 * ✅ Generate content fingerprint untuk duplicate detection
 */
function generateContentFingerprint(author, timestamp, contentText, imageUrl) {
    const crypto = require('crypto');
    
    // Normalize data
    const normalizedAuthor = String(author || '').trim().toLowerCase();
    const normalizedTimestamp = String(timestamp || '').trim();
    const normalizedContent = String(contentText || '').trim().substring(0, 200);
    
    // Combine untuk hash
    const combined = `${normalizedAuthor}|${normalizedTimestamp}|${normalizedContent}`;
    const hash = crypto.createHash('md5').update(combined).digest('hex');
    
    return hash;
}

/**
 * ✅ FIXED: Convert Facebook date format ke ISO 8601
 * Handle format: "Monday 6 October 2025 at 15:37"
 */
function convertToISO(dateString) {
    if (!dateString || dateString === "N/A") {
        return null;
    }
    
    try {
        // ✅ ENHANCED PATTERNS: Handle with and without time
        const patterns = [
            // WITH TIME:
            // "Monday 6 October 2025 at 15:37"
            { regex: /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})\s+(\w+)\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})/i, hasTime: true, format: 'day-month' },
            // "6 October 2025 at 15:37"
            { regex: /(\d{1,2})\s+(\w+)\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})/i, hasTime: true, format: 'day-month' },
            // "October 6, 2025 at 15:37" (US format)
            { regex: /(\w+)\s+(\d{1,2}),?\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})/i, hasTime: true, format: 'month-day' },

            // WITHOUT TIME (use 00:00:00 as default):
            // "22 December 2023"
            { regex: /^(\d{1,2})\s+(\w+)\s+(\d{4})$/i, hasTime: false, format: 'day-month' },
            // "December 22, 2023" (US format)
            { regex: /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i, hasTime: false, format: 'month-day' },
            // "Monday 22 December 2023"
            { regex: /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+(\w+)\s+(\d{4})$/i, hasTime: false, format: 'day-month' },
        ];

        let match = null;
        let matchedPattern = null;

        for (const pattern of patterns) {
            match = dateString.match(pattern.regex);
            if (match) {
                matchedPattern = pattern;
                break;
            }
        }

        if (!match) {
            console.warn(`   ⚠️ Could not parse date: ${dateString}`);
            return null;
        }

        let day, monthName, year, hour = '00', minute = '00';

        if (matchedPattern.format === 'month-day') {
            // US format: month day year
            monthName = match[1];
            day = match[2];
            year = match[3];
            if (matchedPattern.hasTime) {
                hour = match[4];
                minute = match[5];
            }
        } else {
            // Normal format: day month year
            day = match[1];
            monthName = match[2];
            year = match[3];
            if (matchedPattern.hasTime) {
                hour = match[4];
                minute = match[5];
            }
        }
        
        const months = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04',
            'may': '05', 'june': '06', 'july': '07', 'august': '08',
            'september': '09', 'october': '10', 'november': '11', 'december': '12',
            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
            'jun': '06', 'jul': '07', 'aug': '08', 'sep': '09',
            'oct': '10', 'nov': '11', 'dec': '12'
        };
        
        const month = months[monthName.toLowerCase()];
        
        if (!month) {
            console.warn(`   ⚠️ Unknown month: ${monthName}`);
            return null;
        }
        
        const isoDate = `${year}-${month}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00.000Z`;
        
        const dateObj = new Date(isoDate);
        if (isNaN(dateObj.getTime())) {
            console.warn(`   ⚠️ Invalid date constructed: ${isoDate}`);
            return null;
        }
        
        return isoDate;
        
    } catch (e) {
        console.warn(`   ⚠️ Date conversion error: ${e.message}`);
        return null;
    }
}

/**
 * ✅ FIXED: Validate timestamp - pakai ISO result
 */
function isValidTimestamp(timestamp) {
    if (!timestamp || timestamp === "N/A") {
        return false;
    }
    
    try {
        // ✅ Convert dulu ke ISO
        const isoDate = convertToISO(timestamp);
        
        if (!isoDate) {
            console.log(`      ⚠️ Cannot convert to ISO: ${timestamp}`);
            return false;
        }
        
        const postDate = new Date(isoDate);
        const cutoffDate = new Date(CONFIG.CUTOFF_DATE + 'T00:00:00.000Z');
        
        if (isNaN(postDate.getTime())) {
            console.log(`      ⚠️ Invalid date format: ${timestamp}`);
            return false;
        }
        
        if (postDate < cutoffDate) {
            console.log(`      ⏭️  SKIP: Post before ${CONFIG.CUTOFF_DATE} (${timestamp})`);
            return false;
        }
        
        return true;
    } catch (e) {
        console.warn(`      ⚠️ Date validation error: ${e.message}`);
        return false;
    }
}

/**
 * ✅ NEW: Get CSV filename based on year or recent mode
 */
function getCSVFilename(filterYear) {
    if (!filterYear || filterYear === 'recent_mode') {
        return path.join(CONFIG.csv_base_folder, CONFIG.csv_recent_filename);
    }
    return path.join(CONFIG.csv_base_folder, `${CONFIG.csv_historical_prefix}${filterYear}.csv`);
}

// ======== ✅ GRAPHQL HYBRID MODE FUNCTIONS ========

/**
 * ✅ Setup GraphQL Response Interceptor
 */
let latestGraphQLResponse = null;
let graphqlResponseMap = new Map(); // Store responses by cursor/page

// ✅ GraphQL Comment Responses
let latestCommentGraphQLResponse = null;
let commentGraphQLResponseMap = new Map(); // Store comment responses by post ID

async function setupGraphQLInterceptor(page) {
    if (!CONFIG.USE_HYBRID_MODE) return;

    console.log('📡 Setting up GraphQL interceptor...');

    page.on('response', async (response) => {
        try {
            if (response.url().includes('/api/graphql/') && response.status() === 200) {
                const contentType = response.headers()['content-type'] || '';

                if (contentType.includes('application/json')) {
                    const json = await response.json();

                    // Check if this is a search response (posts)
                    if (json?.data?.serpResponse?.results) {
                        latestGraphQLResponse = json;

                        const edges = json.data.serpResponse.results.edges || [];
                        console.log(`      📥 GraphQL Response: ${edges.length} posts`);

                        // Store by cursor for pagination
                        const cursor = json.data.serpResponse.results.page_info?.end_cursor;
                        if (cursor) {
                            graphqlResponseMap.set(cursor, json);
                        }

                        trackStrategy('data_source', 'graphql_intercepted');
                    }

                    // ✅ Check if this is a comment response
                    if (json?.data?.node?.comment_rendering_instance_for_feed_location?.comments) {
                        latestCommentGraphQLResponse = json;

                        const commentData = json.data.node.comment_rendering_instance_for_feed_location.comments;
                        const commentEdges = commentData.edges || [];
                        const totalComments = commentData.total_count || commentEdges.length;

                        console.log(`      💬 GraphQL Comment Response: ${commentEdges.length} comments (total: ${totalComments})`);

                        // ✅ Store by multiple ID formats for better matching
                        const nodeId = json.data.node.id;
                        const feedbackId = json.data.node?.comment_rendering_instance_for_feed_location?.id;
                        const shareFbid = json.data.node?.parent_feedback?.share_fbid;

                        // Store with all available ID formats
                        const idFormats = [nodeId, feedbackId, shareFbid].filter(Boolean);

                        for (const id of idFormats) {
                            commentGraphQLResponseMap.set(id, json);
                        }

                        console.log(`      📦 Stored comment response with IDs: ${idFormats.join(', ')}`);

                        trackStrategy('data_source', 'comment_graphql_intercepted');
                    }
                }
            }
        } catch (err) {
            // Silent fail - not all responses are JSON
        }
    });
}

/**
 * ✅ Extract Post Data from GraphQL Response
 */
function extractPostFromGraphQL(story, edgeData) {
    if (!story) return null;

    try {
        const feedback = story.feedback?.comet_ufi_summary_and_actions_renderer?.feedback;
        const metadata = story.comet_sections?.context_layout?.story?.comet_sections?.metadata?.[0]?.story;

        const data = {
            // IDs
            post_id: story.post_id || story.id,

            // Author
            author: story.actors?.[0]?.name || story.feedback?.owning_profile?.name || 'N/A',
            author_id: story.actors?.[0]?.id || story.feedback?.owning_profile?.id || 'N/A',
            author_url: normalizeFacebookUrl(story.actors?.[0]?.url || (story.actors?.[0]?.id ? `/${story.actors?.[0]?.id}` : 'N/A')),
            author_followers: story.actors?.[0]?.subscribers?.count || story.feedback?.owning_profile?.subscribers?.count || 0,

            // Content
            content_text: story.message?.text || '',

            // Timestamp (Unix to ISO)
            timestamp_unix: metadata?.creation_time,
            timestamp: metadata?.creation_time
                ? new Date(metadata.creation_time * 1000).toISOString()
                : 'N/A',
            timestamp_iso: metadata?.creation_time
                ? new Date(metadata.creation_time * 1000).toISOString()
                : 'N/A',

            // URLs
            post_url: story.url || story.wwwURL || 'N/A',
            share_url: story.url || story.wwwURL || 'N/A',

            // Attachments - Images
            attachments: story.attachments || [],
            image_url: 'N/A',
            image_source: 'N/A',
            image_count: 0,

            // Attachments - Videos
            video_url: 'N/A',
            video_source: 'N/A',

            // Engagement
            reactions_total: feedback?.reaction_count?.count || 0,
            comments: feedback?.comment_rendering_instance?.comments?.total_count || 0,
            shares: feedback?.share_count?.count || 0,
            views: 0, // Need to get from video attachments

            // Other
            location: 'N/A',
            privacy: story.comet_sections?.context_layout?.story?.privacy_scope?.description || 'N/A',

            // ✅ NEW: Music fields
            music_title: 'N/A',
            music_artist: 'N/A',

            // Meta
            data_source: 'graphql'
        };

        // Extract image URLs
        if (data.attachments.length > 0) {
            const firstAttachment = data.attachments[0];
            const subAttachments = firstAttachment.styles?.attachment?.all_subattachments;

            if (subAttachments) {
                data.image_count = subAttachments.count || 0;

                if (subAttachments.nodes && subAttachments.nodes.length > 0) {
                    const firstNode = subAttachments.nodes[0];
                    data.image_source = firstNode.media?.image?.uri || 'N/A';
                    data.image_url = firstNode.url || firstAttachment.styles?.attachment?.url || 'N/A';
                }
            }

            // Check for video
            if (firstAttachment.media?.__typename === 'Video') {
                data.video_url = firstAttachment.media?.playable_url || 'N/A';
                data.video_source = firstAttachment.media?.browser_native_sd_url || firstAttachment.media?.playable_url || 'N/A';
                data.views = firstAttachment.media?.video_view_count || 0;
            }
        }

        return data;

    } catch (err) {
        console.warn(`      ⚠️ GraphQL extraction error: ${err.message}`);
        return null;
    }
}

/**
 * ✅ Get GraphQL Data for Current Posts
 */
function getGraphQLDataForPosts() {
    if (!latestGraphQLResponse) return [];

    const edges = latestGraphQLResponse?.data?.serpResponse?.results?.edges || [];
    const posts = [];

    for (const edge of edges) {
        const story = edge?.rendering_strategy?.view_model?.click_model?.story;
        if (story) {
            const postData = extractPostFromGraphQL(story, edge);
            if (postData) {
                posts.push(postData);
            }
        }
    }

    return posts;
}

/**
 * ✅ Merge GraphQL + HTML Data (Best of Both Worlds)
 */
function mergeDataSources(graphqlData, htmlData) {
    const merged = { ...htmlData };
    const sources = {};

    // For each field, use GraphQL if available and not empty, otherwise use HTML
    const fields = [
        'author', 'author_id', 'author_url', 'author_followers', 'content_text', 'timestamp', 'timestamp_iso',
        'post_url', 'share_url', 'image_url', 'image_source', 'video_url', 'video_source',
        'reactions_total', 'comments', 'shares', 'views', 'location', 'music_title', 'music_artist'
    ];

    for (const field of fields) {
        const graphqlValue = graphqlData?.[field];
        const htmlValue = htmlData?.[field];

        // Determine which value to use
        const graphqlValid = graphqlValue && graphqlValue !== 'N/A' && graphqlValue !== 0;
        const htmlValid = htmlValue && htmlValue !== 'N/A' && htmlValue !== 0;

        if (CONFIG.PREFER_GRAPHQL && graphqlValid) {
            merged[field] = graphqlValue;
            sources[field] = 'graphql';
            trackStrategy('data_source', `${field}_from_graphql`);
        } else if (htmlValid) {
            merged[field] = htmlValue;
            sources[field] = 'html';
            trackStrategy('data_source', `${field}_from_html`);
        } else if (graphqlValid) {
            merged[field] = graphqlValue;
            sources[field] = 'graphql';
            trackStrategy('data_source', `${field}_from_graphql`);
        } else {
            merged[field] = htmlValue || 'N/A';
            sources[field] = htmlValue ? 'html' : 'missing';
            trackStrategy('data_source', `${field}_missing`);
        }
    }

    // Add meta info
    merged.data_sources = sources;
    merged.hybrid_mode = true;

    return merged;
}

/**
 * ✅ Find GraphQL Post by URL or ID
 */
function findGraphQLPostByUrl(url) {
    const graphqlPosts = getGraphQLDataForPosts();

    for (const post of graphqlPosts) {
        if (post.post_url === url || post.share_url === url) {
            return post;
        }

        // Try matching by post_id
        if (url.includes(post.post_id)) {
            return post;
        }
    }

    return null;
}

// ============================================================================
// ✅ COMMENT EXTRACTION FUNCTIONS (Hybrid: GraphQL + HTML)
// ============================================================================

/**
 * ✅ Parse Comments from GraphQL Response
 * Extracts up to MAX_COMMENTS_PER_POST parent comments and MAX_NESTED_REPLIES per comment
 */
function parseCommentsFromGraphQL(graphqlResponse, postUrl, postAuthor) {
    if (!graphqlResponse) return [];

    const comments = [];

    try {
        const commentData = graphqlResponse?.data?.node?.comment_rendering_instance_for_feed_location?.comments;
        if (!commentData || !commentData.edges) return [];

        const edges = commentData.edges || [];
        let parentCount = 0;

        for (const edge of edges) {
            const node = edge.node;
            if (!node) continue;

            // Only process parent comments (depth 0) up to the limit
            if (node.depth === 0 && parentCount >= CONFIG.MAX_COMMENTS_PER_POST) {
                break;
            }

            // Skip if depth > 0 and we've already hit the nested reply limit
            // (This will be handled when we process replies)
            if (node.depth > 0) continue;

            // Extract parent comment
            const comment = {
                post_url: postUrl,
                post_author: postAuthor,
                comment_id: node.legacy_fbid || node.id,
                comment_author: node.author?.name || 'Unknown',
                comment_author_url: normalizeFacebookUrl(node.author?.url || `/${node.author?.id || 'unknown'}`),
                comment_text: cleanTextForCSV(node.body?.text || ''),
                comment_timestamp: node.created_time
                    ? new Date(node.created_time * 1000).toISOString()
                    : 'N/A',
                comment_timestamp_unix: node.created_time || 0,
                comment_reactions: node.feedback?.reactors?.count || 0,
                comment_replies_count: node.feedback?.replies_fields?.total_count || 0,
                comment_depth: node.depth || 0,
                data_source: 'graphql'
            };

            comments.push(comment);
            parentCount++;

            // Extract nested replies (up to MAX_NESTED_REPLIES)
            const repliesConnection = node.feedback?.replies_connection;
            if (repliesConnection && repliesConnection.edges) {
                const replyEdges = repliesConnection.edges.slice(0, CONFIG.MAX_NESTED_REPLIES);

                for (const replyEdge of replyEdges) {
                    const replyNode = replyEdge.node;
                    if (!replyNode) continue;

                    const reply = {
                        post_url: postUrl,
                        post_author: postAuthor,
                        comment_id: replyNode.legacy_fbid || replyNode.id,
                        comment_author: replyNode.author?.name || 'Unknown',
                        comment_author_url: normalizeFacebookUrl(replyNode.author?.url || `/${replyNode.author?.id || 'unknown'}`),
                        comment_text: cleanTextForCSV(replyNode.body?.text || ''),
                        comment_timestamp: replyNode.created_time
                            ? new Date(replyNode.created_time * 1000).toISOString()
                            : 'N/A',
                        comment_timestamp_unix: replyNode.created_time || 0,
                        comment_reactions: replyNode.feedback?.reactors?.count || 0,
                        comment_replies_count: 0, // Nested replies don't have sub-replies
                        comment_depth: replyNode.depth || 1,
                        data_source: 'graphql'
                    };

                    comments.push(reply);
                }
            }
        }

        console.log(`      💬 GraphQL: Extracted ${comments.filter(c => c.comment_depth === 0).length} parent comments, ${comments.filter(c => c.comment_depth > 0).length} replies`);
        trackStrategy('comments', 'graphql_extracted');

        return comments;

    } catch (err) {
        console.warn(`      ⚠️ GraphQL comment parsing error: ${err.message}`);
        trackStrategy('comments', 'graphql_parse_error');
        return [];
    }
}

/**
 * ✅ NEW: Visual highlight untuk comment yang sedang diproses
 */
async function highlightCurrentComment(commentEl, page) {
    try {
        await commentEl.evaluate(el => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }).catch(() => {});

        await commentEl.evaluate(el => {
            el.style.border = '3px solid #ff0000';
            el.style.backgroundColor = '#fff3cd';
            el.style.transition = 'all 0.3s ease';
        }).catch(() => {});

        await page.waitForTimeout(500);
    } catch (e) {
        // Non-critical
    }
}

/**
 * ✅ NEW: Remove highlight setelah selesai
 */
async function removeHighlight(commentEl) {
    try {
        await commentEl.evaluate(el => {
            el.style.border = '';
            el.style.backgroundColor = '';
        }).catch(() => {});
    } catch (e) {}
}

/**
 * ✅ ENHANCED: Extract full comment timestamp via hover
 */
async function extractCommentFullTimestamp(commentEl, page) {
    try {
        console.log("            🕐 Extracting full timestamp...");

        const timestampSelectors = [
            'li.html-li span.html-span div.html-div a[href*="comment_id"][role="link"]',
            'li span a[href*="comment_id"]',
            'a[href*="comment_id"][role="link"]',
        ];

        let timestampLink = null;
        for (const selector of timestampSelectors) {
            const link = commentEl.locator(selector).first();
            if (await link.count() > 0) {
                timestampLink = link;
                console.log(`            -> Found timestamp link: ${selector.substring(0, 40)}...`);
                break;
            }
        }

        if (!timestampLink) {
            console.log("            ⚠️ No timestamp link found");
            return 'N/A';
        }

        const relativeTime = await timestampLink.textContent().catch(() => '');
        console.log(`            -> Relative time: ${relativeTime}`);

        if (!relativeTime || !/^\d+[mhdwy]$/i.test(relativeTime.trim())) {
            console.log("            ⚠️ Invalid relative time format");
            return 'N/A';
        }

        try {
            await page.mouse.move(0, 0);
            await page.waitForTimeout(300);

            await timestampLink.evaluate(el => {
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }).catch(() => {});
            await page.waitForTimeout(500);

            const box = await timestampLink.boundingBox().catch(() => null);
            if (!box) {
                console.log("            ⚠️ Cannot get bounding box");
                return relativeTime.trim();
            }

            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            console.log(`            -> Hovering to (${Math.round(x)}, ${Math.round(y)})...`);

            await page.mouse.move(x, y, { steps: 8 });
            await page.waitForTimeout(3500);

            const tooltipSelectors = [
                'div[role="tooltip"] span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.x1xmvt09.x1nxh6w3.x1sibtaa.xo1l8bm.xzsf02u[dir="auto"]',
                'div[role="tooltip"] span.x193iq5w.xeuugli.x13faqbe.x1vvkbs',
                'div[role="tooltip"] span.x193iq5w.xeuugli',
                'div[role="tooltip"] span[dir="auto"]',
                'div[role="tooltip"] span',
            ];

            for (const selector of tooltipSelectors) {
                const tooltip = page.locator(selector).first();
                if (await tooltip.count() > 0) {
                    const fullTimestamp = await tooltip.textContent().catch(() => '');
                    console.log(`            -> Tooltip text: ${fullTimestamp}`);

                    if (fullTimestamp &&
                        fullTimestamp.match(/\d{4}/) &&
                        fullTimestamp.match(/\d{1,2}:\d{2}/) &&
                        fullTimestamp.length > 15) {
                        console.log(`            ✅ Full timestamp extracted!`);
                        await page.mouse.move(0, 0).catch(() => {});
                        return cleanTextForCSV(fullTimestamp);
                    }
                }
            }
            console.log("            ⚠️ Tooltip not found or invalid");
        } catch (hoverError) {
            console.log(`            ⚠️ Hover error: ${hoverError.message.substring(0, 40)}`);
        }

        await page.mouse.move(0, 0).catch(() => {});
        console.log(`            ⚠️ Fallback to relative time: ${relativeTime.trim()}`);
        return relativeTime.trim();
    } catch (error) {
        console.log(`            ❌ Error: ${error.message.substring(0, 40)}`);
        return 'N/A';
    }
}

/**
 * ✅ COMPLETE: Extract single comment with FULL timestamp support
 */
async function extractSingleComment(commentEl, postAuthor = 'Unknown', page = null) {
    try {
        const comment = {
            post_author: postAuthor,
            post_url: '',
            comment_id: 'N/A',
            comment_author: 'Unknown',
            comment_author_url: 'N/A',
            comment_text: '',
            comment_timestamp: 'N/A',
            comment_timestamp_unix: 0,
            comment_reactions: 0,
            comment_replies_count: 0,
            comment_depth: 0,
            data_source: 'html'
        };

        // EXTRACT AUTHOR
        const authorSelectors = [
            'div.xwib8y2.xpdmqnj.x1g0dm76.x1y1aw1k span.xt0psk2 span.xjp7ctv a span.x3nfvp2 span.x193iq5w.xeuugli',
            'a[role="link"] span.x193iq5w.xeuugli.x13faqbe.x1vvkbs',
            'a[href*="comment_id"] span.x193iq5w',
            'a[role="link"] span.x193iq5w',
        ];

        for (const selector of authorSelectors) {
            const authorEl = commentEl.locator(selector).first();
            if (await authorEl.count() > 0) {
                const text = await authorEl.textContent().catch(() => null);
                if (text?.trim() && text.length > 1 && text.length < 100) {
                    comment.comment_author = cleanTextForCSV(text.trim());
                    break;
                }
            }
        }

        // EXTRACT TEXT
        const textSelectors = [
            'div.x1lliihq.xjkvuk6.x1iorvi4 span[dir="auto"][lang="id-ID"] div.xdj266r div[dir="auto"]',
            'div.x1lliihq.xjkvuk6.x1iorvi4 span[dir="auto"] div.xdj266r div[dir="auto"]',
            'div.x1lliihq.xjkvuk6.x1iorvi4 div[dir="auto"][style*="text-align"]',
            'div.x1lliihq.xjkvuk6.x1iorvi4',
        ];

        for (let selectorIndex = 0; selectorIndex < textSelectors.length; selectorIndex++) {
            const selector = textSelectors[selectorIndex];

            if (selectorIndex < 3) {
                const textDivs = await commentEl.locator(selector).all();
                if (textDivs.length > 0) {
                    const textParts = [];
                    for (const div of textDivs) {
                        const text = await div.textContent().catch(() => '');
                        const cleaned = text.trim();
                        if (cleaned.length > 2 &&
                            !cleaned.match(/^\d+[mhdwy]$/i) &&
                            !cleaned.toLowerCase().includes('like') &&
                            !cleaned.toLowerCase().includes('reply') &&
                            !cleaned.toLowerCase().includes('see translation')) {
                            textParts.push(cleaned);
                        }
                    }
                    if (textParts.length > 0) {
                        const uniqueTexts = [...new Set(textParts)];
                        comment.comment_text = cleanTextForCSV(uniqueTexts.join(' '));
                        break;
                    }
                }
            } else {
                const container = commentEl.locator(selector).first();
                if (await container.count() > 0) {
                    const allTextDivs = await container.locator('div[dir="auto"]').allTextContents();
                    const textParts = [];
                    for (const text of allTextDivs) {
                        const cleaned = text.trim();
                        if (cleaned.length > 2 &&
                            !cleaned.match(/^\d+[mhdwy]$/i) &&
                            !cleaned.toLowerCase().includes('like') &&
                            !cleaned.toLowerCase().includes('reply') &&
                            !cleaned.toLowerCase().includes('see translation') &&
                            !cleaned.toLowerCase().includes('hide or report')) {
                            textParts.push(cleaned);
                        }
                    }
                    if (textParts.length > 0) {
                        const uniqueTexts = [...new Set(textParts)];
                        comment.comment_text = cleanTextForCSV(uniqueTexts.join(' '));
                        break;
                    }
                }
            }
        }

        if (!comment.comment_text || comment.comment_text.length === 0) {
            return null;
        }

        // EXTRACT REACTIONS
        try {
            const reactionSelectors = [
                'div[aria-label*="reaction"][role="button"]',
                'span.html-span div[aria-label*="reaction"]',
            ];
            for (const selector of reactionSelectors) {
                const reactionEl = commentEl.locator(selector).first();
                if (await reactionEl.count() > 0) {
                    const ariaLabel = await reactionEl.getAttribute('aria-label').catch(() => null);
                    if (ariaLabel) {
                        const match = ariaLabel.match(/(\d+)\s+reactions?/i);
                        if (match) {
                            comment.comment_reactions = parseInt(match[1], 10);
                            break;
                        }
                    }
                }
            }
        } catch (e) {}

        // EXTRACT FULL TIMESTAMP
        if (page) {
            comment.comment_timestamp = await extractCommentFullTimestamp(commentEl, page);
        } else {
            try {
                const timestampSelectors = [
                    'li span a[href*="comment_id"]',
                    'a[href*="comment_id"][role="link"]',
                ];
                for (const selector of timestampSelectors) {
                    const timestampEl = commentEl.locator(selector).first();
                    if (await timestampEl.count() > 0) {
                        const text = await timestampEl.textContent().catch(() => null);
                        if (text?.trim() && /^\d+[mhdwy]$/i.test(text.trim())) {
                            comment.comment_timestamp = text.trim();
                            break;
                        }
                    }
                }
            } catch (e) {}
        }

        if (comment.comment_text) {
            console.log(`         ✅ Author: "${comment.comment_author}" | Text: "${comment.comment_text.substring(0, 50)}..."`);
        }

        if (page && comment.comment_text) {
            await removeHighlight(commentEl);
        }

        return comment;
    } catch (error) {
        console.log(`         ❌ Extract error: ${error.message.substring(0, 40)}`);
        return null;
    }
}

/**
 * ✅ Extract visible comments from container
 */
async function extractVisibleComments(containerEl, postAuthor = 'Unknown', page = null) {
    const comments = [];
    const seenComments = new Set();

    try {
        const commentSelectors = [
            'div[role="article"][aria-label*="Comment by"]',
            'div.x1lliihq.xjkvuk6.x1iorvi4',
            'div.xwib8y2.xpdmqnj.x1g0dm76.x1y1aw1k',
            'div.x18xomjl.xbcz3fp > div',
            'div[class*="x1lliihq"]',
        ];

        let lastNewCommentEl = null;
        for (const selector of commentSelectors) {
            const commentContainers = await containerEl.locator(selector).all();
            if (commentContainers.length > 0) {
                console.log(`            -> Found ${commentContainers.length} comment container(s) with: ${selector.substring(0, 40)}...`);
                for (const commentEl of commentContainers) {
                    try {
                        const comment = await extractSingleComment(commentEl, postAuthor, page);
                        if (comment && comment.comment_text) {
                            const commentKey = `${comment.comment_author}|${comment.comment_text.substring(0, 50)}`;
                            if (!seenComments.has(commentKey)) {
                                comments.push(comment);
                                seenComments.add(commentKey);
                                lastNewCommentEl = commentEl;
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }
                break;
            }
        }

        if (lastNewCommentEl && page) {
            try {
                await highlightCurrentComment(lastNewCommentEl, page);
                console.log(`            ✨ Focused on LATEST new comment`);
            } catch (e) {}
        }
    } catch (error) {
        console.warn(`Error extracting visible comments: ${error.message}`);
    }
    return comments;
}

/**
 * ✅ Extract Comments from Dialog (Helper function)
 * Assumes dialog is already opened
 */
async function extractCommentsFromDialog(page, postUrl, postAuthor) {
    const comments = [];
    const globalSeenComments = new Set();

    try {
        console.log(`      💬 HTML: Extracting from opened dialog...`);

        // ✅ STEP 1: Find dialog
        const dialog = page.locator('div[role="dialog"]').first();
        if (await dialog.count() === 0) {
            console.log(`      ⚠️  No dialog found!`);
            return [];
        }

        // ✅ STEP 1.5: Extract post author dari dialog header
        try {
            console.log(`         -> Extracting post author from dialog...`);
            const dialogHeaderSelectors = [
                'div[role="dialog"] h2[dir="auto"]',
                'div[role="dialog"] h2 span[dir="auto"]',
                'div[role="dialog"][aria-label]',
                'div[role="dialog"] span.x193iq5w.xeuugli',
            ];

            for (const selector of dialogHeaderSelectors) {
                const headerEl = page.locator(selector).first();
                if (await headerEl.count() > 0) {
                    let headerText = await headerEl.textContent().catch(() => '');
                    if (!headerText) {
                        headerText = await headerEl.getAttribute('aria-label').catch(() => '');
                    }
                    if (headerText) {
                        let match = headerText.match(/(.+)'s post/i);
                        if (match) {
                            postAuthor = match[1].trim();
                            console.log(`         ✅ Post author: ${postAuthor}`);
                            break;
                        }
                        if (headerText.length > 0 && headerText.length < 100) {
                            postAuthor = headerText.trim();
                            console.log(`         ✅ Post author (alt): ${postAuthor}`);
                            break;
                        }
                    }
                }
            }
            if (postAuthor === 'Unknown') {
                console.log(`         ⚠️ Could not extract post author from dialog`);
            }
        } catch (e) {
            console.log(`         ⚠️ Error extracting post author: ${e.message.substring(0, 40)}`);
        }

        // ✅ STEP 2: Wait for dialog to load
        console.log(`         -> Waiting for dropdown to load...`);
        await page.waitForTimeout(4000);

        // Check for loading indicators
        let loadingCheckAttempts = 0;
        const maxLoadingChecks = 5;
        while (loadingCheckAttempts < maxLoadingChecks) {
            const isLoading = await page.locator(
                'div[role="dialog"] div[role="progressbar"], ' +
                'div[role="dialog"] div[data-visualcompletion="loading-state"]'
            ).count() > 0;

            if (isLoading) {
                console.log(`         -> Dialog still loading (check ${loadingCheckAttempts + 1}/${maxLoadingChecks})...`);
                await page.waitForTimeout(2000);
                loadingCheckAttempts++;
            } else {
                console.log(`         -> Dialog fully loaded!`);
                break;
            }
        }
        await page.waitForTimeout(1500);

        // ✅ STEP 3: Click "Most relevant" dropdown & select "All comments"
        const dropdownSelectors = [
            'div[aria-expanded="false"][aria-haspopup="menu"][role="button"]:has(span:has-text("Most relevant"))',
            'div[aria-haspopup="menu"][role="button"]:has(span:has-text("Most relevant"))',
            'div.x1i10hfl.xjbqb8w[role="button"]:has(span.x193iq5w:has-text("Most relevant"))',
            'div[role="button"]:has(span:has-text("Most relevant"))',
        ];

        let dropdownClicked = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            for (const selector of dropdownSelectors) {
                try {
                    const parentButton = page.locator(selector).first();
                    await parentButton.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

                    const count = await parentButton.count();
                    if (count === 0) continue;

                    console.log(`         -> Found dropdown with: ${selector.substring(0, 60)}... (attempt ${attempt}/3)`);
                    await parentButton.scrollIntoViewIfNeeded().catch(() => {});
                    await page.waitForTimeout(800);

                    let clicked = false;
                    try {
                        await parentButton.click({ timeout: 5000 });
                        clicked = true;
                    } catch (e1) {
                        try {
                            await parentButton.click({ force: true, timeout: 5000 });
                            clicked = true;
                        } catch (e2) {
                            await parentButton.evaluate(el => el.click());
                            clicked = true;
                        }
                    }

                    if (clicked) {
                        await page.waitForTimeout(3000);
                        const menuOpened = await page.locator('div[role="menu"]').count() > 0;
                        if (menuOpened) {
                            console.log(`         ✅ Dropdown opened successfully!`);
                            dropdownClicked = true;
                            break;
                        } else {
                            console.log(`         ⚠️ Menu didn't open, retrying...`);
                            await page.waitForTimeout(2000);
                        }
                    }
                } catch (e) {
                    console.log(`         -> Dropdown click failed with selector ${dropdownSelectors.indexOf(selector) + 1}: ${e.message.substring(0, 30)}`);
                    continue;
                }
            }
            if (dropdownClicked) break;
            if (attempt < 3) {
                console.log(`         -> Retrying dropdown click (attempt ${attempt + 1}/3)...`);
                await page.waitForTimeout(2000);
            }
        }

        if (!dropdownClicked) {
            console.log(`         ⚠️ Could not open dropdown after 3 attempts (continuing with default filter)`);
        }

        // ✅ STEP 4: Click "All comments"
        if (dropdownClicked) {
            console.log(`         -> Looking for comment filter options...`);
            await page.waitForTimeout(1500);

            let allCommentsClicked = false;
            try {
                const allMenuItems = await page.locator('div[role="menuitem"]').all();
                console.log(`         -> Found ${allMenuItems.length} filter option(s)`);

                for (let i = 0; i < allMenuItems.length; i++) {
                    const menuItem = allMenuItems[i];
                    try {
                        const itemText = await menuItem.textContent().catch(() => '');
                        console.log(`         -> Option ${i + 1}: "${itemText.substring(0, 30)}..."`);

                        if (itemText.includes('All comments') || itemText.includes('Show all comments')) {
                            console.log(`         ✅ Found "All comments" (option ${i + 1})! Clicking...`);
                            await menuItem.scrollIntoViewIfNeeded().catch(() => {});
                            await page.waitForTimeout(500);

                            let clicked = false;
                            try {
                                await menuItem.click({ timeout: 3000 });
                                clicked = true;
                            } catch (e1) {
                                try {
                                    await menuItem.click({ force: true, timeout: 3000 });
                                    clicked = true;
                                } catch (e2) {
                                    const spanInside = menuItem.locator('span:has-text("All comments")').first();
                                    if (await spanInside.count() > 0) {
                                        await spanInside.click({ timeout: 3000 });
                                        clicked = true;
                                    }
                                }
                            }

                            if (clicked) {
                                await page.waitForTimeout(3000);
                                console.log(`         ✅ "All comments" selected successfully!`);
                                allCommentsClicked = true;
                                break;
                            } else {
                                console.log(`         ⚠️ Click failed, trying next option...`);
                            }
                        }
                    } catch (itemError) {
                        console.log(`         -> Error checking option ${i + 1}: ${itemError.message.substring(0, 30)}`);
                        continue;
                    }
                }

                if (!allCommentsClicked) {
                    console.log(`         ⚠️ "All comments" not found, trying "Newest" as fallback`);
                    for (const menuItem of allMenuItems) {
                        const itemText = await menuItem.textContent().catch(() => '');
                        if (itemText.includes('Newest') || itemText.includes('newest comments first')) {
                            console.log(`         -> Clicking "Newest" as fallback...`);
                            try {
                                await menuItem.scrollIntoViewIfNeeded().catch(() => {});
                                await page.waitForTimeout(500);
                                await menuItem.click({ timeout: 3000 });
                                await page.waitForTimeout(2000);
                                console.log(`         ✓ "Newest" selected as fallback`);
                                allCommentsClicked = true;
                                break;
                            } catch (e) {
                                console.log(`         ⚠️ Newest click failed`);
                            }
                        }
                    }
                }

                if (!allCommentsClicked) {
                    console.log(`         ℹ️ Using default filter (Most relevant)`);
                }
            } catch (error) {
                console.log(`         ⚠️ Error selecting filter: ${error.message.substring(0, 40)}`);
                console.log(`         -> Continuing with default filter...`);
            }
        }

        // ✅ STEP 5: Find scrollable container (5 STRATEGIES!)
        console.log(`         -> Finding scrollable comment area...`);
        let scrollableArea = null;

        // Strategy 1: Exact class
        scrollableArea = page.locator(
            'div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x78zum5.xdt5ytf.x1iyjqo2.x1n2onr6.xqbnct6.xga75y6'
        ).first();
        if (await scrollableArea.count() > 0) {
            console.log(`         ✓ Strategy 1: Found via exact class`);
        }

        // Strategy 2: Shorter class
        if (!scrollableArea || await scrollableArea.count() === 0) {
            console.log(`         -> Strategy 1 failed, trying strategy 2...`);
            scrollableArea = page.locator('div.x1iyjqo2.x1n2onr6.xqbnct6').first();
            if (await scrollableArea.count() > 0) {
                console.log(`         ✓ Strategy 2: Found via short class`);
            }
        }

        // Strategy 3: Any scrollable div in dialog
        if (!scrollableArea || await scrollableArea.count() === 0) {
            console.log(`         -> Strategy 2 failed, trying strategy 3...`);
            const allDivs = await page.locator('div[role="dialog"] div').all();
            for (let i = 0; i < Math.min(allDivs.length, 20); i++) {
                const div = allDivs[i];
                const canScroll = await div.evaluate(el => {
                    return el.scrollHeight > el.clientHeight && el.scrollHeight > 500;
                }).catch(() => false);

                if (canScroll) {
                    scrollableArea = div;
                    console.log(`         ✓ Strategy 3: Found scrollable div (index ${i})`);
                    break;
                }
            }
        }

        // Strategy 4: Dialog's main content area
        if (!scrollableArea || await scrollableArea.count() === 0) {
            console.log(`         -> Strategy 3 failed, trying strategy 4...`);
            scrollableArea = page.locator('div[role="dialog"] > div > div').nth(1);
            if (await scrollableArea.count() > 0) {
                console.log(`         ✓ Strategy 4: Using nth-child approach`);
            }
        }

        // Strategy 5: Dialog itself
        if (!scrollableArea || await scrollableArea.count() === 0) {
            console.log(`         -> All strategies failed, using dialog as container`);
            scrollableArea = page.locator('div[role="dialog"]').first();
        }

        if (!scrollableArea || await scrollableArea.count() === 0) {
            console.log(`         ❌ No container found at all`);
            return [];
        }

        // ✅ STEP 6: Enhanced scrolling with loading detection & View More buttons
        console.log(`         -> Scrolling to load comments...`);
        let previousCount = 0;
        let sameCountTimes = 0;
        const maxSameCount = 8;
        let scrollAttempts = 0;
        const maxScrollAttempts = 100;
        let lastScrollTop = 0;
        let stuckScrollCount = 0;
        const maxStuckCount = 6;
        let lastVisibleCommentEl = null;

        while (sameCountTimes < maxSameCount &&
            scrollAttempts < maxScrollAttempts &&
            comments.length < CONFIG.MAX_COMMENTS_PER_POST) {

            scrollAttempts++;

            // Enhanced loading detection
            let loadingWaitAttempts = 0;
            const maxLoadingWait = 10;
            let loadingDetected = false;

            while (loadingWaitAttempts < maxLoadingWait) {
                const isLoading = await scrollableArea.locator(
                    'div[role="status"][data-visualcompletion="loading-state"][aria-label="Loading..."]'
                ).count() > 0;

                if (isLoading) {
                    loadingDetected = true;
                    console.log(`         ⏳ Loading more comments (${loadingWaitAttempts + 1}/${maxLoadingWait})...`);

                    if (lastVisibleCommentEl) {
                        try {
                            await lastVisibleCommentEl.evaluate(el => {
                                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                            }).catch(() => {});
                            await lastVisibleCommentEl.evaluate(el => {
                                el.style.border = '3px solid #ff9800';
                                el.style.backgroundColor = '#fff8e1';
                            }).catch(() => {});
                        } catch (e) {}
                    }

                    await page.waitForTimeout(5000);
                    loadingWaitAttempts++;
                } else {
                    if (loadingDetected && loadingWaitAttempts > 0) {
                        console.log(`         ✅ Loading complete after ${loadingWaitAttempts} check(s)!`);
                    }
                    break;
                }
            }

            if (loadingWaitAttempts >= maxLoadingWait) {
                console.log(`         ⚠️ Loading didn't stop after ${maxLoadingWait} checks (50s) - continuing anyway...`);
            }

            if (loadingDetected) {
                await page.waitForTimeout(2000);
            }

            // Scroll with multiple methods
            try {
                await scrollableArea.evaluate(el => {
                    el.scrollTop = el.scrollHeight;
                }).catch(() => {});

                await scrollableArea.evaluate(el => {
                    el.scrollBy(0, 1000);
                }).catch(() => {});

                const lastComment = scrollableArea.locator('div[role="article"]').last();
                if (await lastComment.count() > 0) {
                    await lastComment.scrollIntoViewIfNeeded().catch(() => {});
                    lastVisibleCommentEl = lastComment;
                }
            } catch (e) {
                console.log(`         -> Scroll error: ${e.message.substring(0, 30)}`);
            }

            await page.waitForTimeout(CONFIG.COMMENT_SCROLL_DELAY + 2000);

            // Check scroll position
            const currentScrollTop = await scrollableArea.evaluate(el => el.scrollTop).catch(() => -1);

            if (currentScrollTop === lastScrollTop && currentScrollTop !== -1) {
                stuckScrollCount++;
                console.log(`         -> Scroll position stuck (${stuckScrollCount}/${maxStuckCount})`);

                if (stuckScrollCount >= maxStuckCount) {
                    const viewMoreButton = await scrollableArea.locator(
                        'div[role="button"]:has-text("View more comments"), ' +
                        'span:has-text("View more comments"), ' +
                        'div[role="button"]:has-text("View previous comments")'
                    ).first();

                    if (await viewMoreButton.count() > 0) {
                        console.log(`         -> Found "View more" button, clicking...`);
                        try {
                            await viewMoreButton.scrollIntoViewIfNeeded().catch(() => {});
                            await page.waitForTimeout(500);
                            await viewMoreButton.click({ timeout: 3000 });
                            await page.waitForTimeout(3000);
                            stuckScrollCount = 0;
                            console.log(`         ✅ "View more" clicked, continuing...`);
                            continue;
                        } catch (e) {
                            console.log(`         -> Could not click "View more"`);
                        }
                    }

                    const finalLoadingCheck = await scrollableArea.locator(
                        'div[role="status"][data-visualcompletion="loading-state"]'
                    ).count() > 0;

                    if (!finalLoadingCheck) {
                        console.log(`         ✅ No loading indicator + scroll stuck = End reached!`);
                        break;
                    } else {
                        console.log(`         ⚠️ Still loading detected, waiting more...`);
                        stuckScrollCount = 0;
                    }
                }
            } else {
                stuckScrollCount = 0;
                lastScrollTop = currentScrollTop;
            }

            // Extract visible comments
            const currentComments = await extractVisibleComments(scrollableArea, postAuthor, page);

            const newCommentsOnly = currentComments.filter(comment => {
                const fingerprint = `${comment.comment_author}|${comment.comment_text.substring(0, 50)}`;
                if (!globalSeenComments.has(fingerprint)) {
                    globalSeenComments.add(fingerprint);
                    return true;
                }
                return false;
            });

            // ✅ Respect MAX_COMMENTS_PER_POST limit when adding new comments (efficient approach)
            const remainingSlots = CONFIG.MAX_COMMENTS_PER_POST - comments.length;
            const commentsToAdd = newCommentsOnly.slice(0, remainingSlots);
            comments.push(...commentsToAdd);
            const currentCount = comments.length;

            // ✅ Break early if we've reached the limit
            if (currentCount >= CONFIG.MAX_COMMENTS_PER_POST) {
                console.log(`         ✅ Reached MAX_COMMENTS_PER_POST (${CONFIG.MAX_COMMENTS_PER_POST}), stopping...`);
                break;
            }

            if (currentCount === previousCount) {
                sameCountTimes++;
                console.log(`         -> Same count (${sameCountTimes}/${maxSameCount}): ${currentCount} comments`);

                const noLoading = await scrollableArea.locator(
                    'div[role="status"][data-visualcompletion="loading-state"]'
                ).count() === 0;

                if (noLoading && sameCountTimes >= 3) {
                    console.log(`         ✅ No new comments + no loading = Finished!`);
                    break;
                }
            } else {
                sameCountTimes = 0;
                const newAdded = currentCount - previousCount;
                console.log(`         -> Loaded: ${currentCount} comments (+${newAdded} NEW, ${currentComments.length - newAdded} duplicate)`);
            }

            previousCount = currentCount;

            // Double-check if at end
            if (sameCountTimes >= maxSameCount - 1) {
                console.log(`         -> Double-checking if truly at end...`);
                await page.waitForTimeout(5000);

                const finalCheck = await scrollableArea.locator(
                    'div[role="status"][data-visualcompletion="loading-state"]'
                ).count() > 0;

                if (finalCheck) {
                    console.log(`         -> Still loading, resetting counter...`);
                    sameCountTimes = 0;
                    continue;
                }

                const recheckComments = await extractVisibleComments(scrollableArea, postAuthor, page);
                let foundMore = false;
                for (const comment of recheckComments) {
                    const fingerprint = `${comment.comment_author}|${comment.comment_text.substring(0, 50)}`;
                    if (!globalSeenComments.has(fingerprint)) {
                        foundMore = true;
                        break;
                    }
                }

                if (foundMore) {
                    console.log(`         -> Found more NEW comments!`);
                    sameCountTimes = 0;
                    continue;
                }

                const viewMoreBtn = await scrollableArea.locator(
                    'div[role="button"]:has-text("View more"), span:has-text("View more")'
                ).first();

                if (await viewMoreBtn.count() > 0) {
                    console.log(`         -> Final check: "View more" button found!`);
                    try {
                        await viewMoreBtn.click({ timeout: 3000 });
                        await page.waitForTimeout(3000);
                        sameCountTimes = 0;
                        console.log(`         -> Clicked, continuing...`);
                        continue;
                    } catch (e) {
                        console.log(`         -> Could not click final "View more"`);
                    }
                }
            }
        }

        // Clear highlight
        if (lastVisibleCommentEl) {
            try {
                await lastVisibleCommentEl.evaluate(el => {
                    el.style.border = '';
                    el.style.backgroundColor = '';
                }).catch(() => {});
            } catch (e) {}
        }

        console.log(`         ✓ Scroll complete after ${scrollAttempts} attempts`);
        console.log(`         ✅ Extracted ${comments.length} comments`);

        // ✅ Ensure we don't exceed MAX_COMMENTS_PER_POST
        if (comments.length > CONFIG.MAX_COMMENTS_PER_POST) {
            console.log(`         ⚠️ Trimming ${comments.length - CONFIG.MAX_COMMENTS_PER_POST} comments to respect MAX_COMMENTS_PER_POST`);
            comments = comments.slice(0, CONFIG.MAX_COMMENTS_PER_POST);
        }

        // Set post_url for all comments
        for (const comment of comments) {
            comment.post_url = postUrl;
        }

        // ✅ CLOSE DIALOG after extraction (Act Like Human!)
        await closeCommentDialog(page);

        return comments;

    } catch (error) {
        console.warn(`      ⚠️ Dialog extraction error: ${error.message.substring(0, 50)}`);

        // ✅ CLOSE DIALOG even on error
        try {
            await closeCommentDialog(page);
        } catch (e) {
            console.warn(`         ⚠️ Could not close dialog on error`);
        }

        return [];
    }
}

/**
 * ✅ Extract Comments from HTML (Fallback method)
 * Based on facebookakon.js logic
 */
async function extractCommentsFromHTML(page, postEl, postUrl, postAuthor) {
    const comments = [];
    let dialogOpened = false;

    try {
        console.log(`      💬 HTML: Starting comment extraction...`);

        // Step 1: Click comment button to open dialog
        const commentButtonSelectors = [
            'span.xkrqix3.x1sur9pj:has-text("comment")',
            'span:has-text("comment")',
            'div[role="button"]:has(span:has-text("comment"))',
        ];

        for (const selector of commentButtonSelectors) {
            try {
                const commentBtn = postEl.locator(selector).first();

                if (await commentBtn.count() > 0) {
                    await commentBtn.scrollIntoViewIfNeeded().catch(() => {});
                    await page.waitForTimeout(500);

                    const parentButton = postEl.locator('div[role="button"]:has(span:has-text("comment"))').first();

                    if (await parentButton.count() > 0) {
                        await parentButton.click({ timeout: 5000 });
                        await page.waitForTimeout(3000);

                        // Verify dialog opened
                        const dialog = page.locator('div[role="dialog"]').first();
                        if (await dialog.count() > 0) {
                            dialogOpened = true;
                            console.log(`      ✅ Comment dialog opened`);
                            break;
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }

        if (!dialogOpened) {
            console.log(`      ℹ️  HTML: No comment dialog opened`);
            trackStrategy('comments', 'html_no_dialog');
            return [];
        }

        // Step 2: Extract comments from dialog
        const extractedComments = await extractCommentsFromDialog(page, postUrl, postAuthor);
        comments.push(...extractedComments);

        return comments;

    } catch (err) {
        console.warn(`      ⚠️ HTML comment extraction error: ${err.message}`);
        trackStrategy('comments', 'html_extraction_error');
        return [];
    } finally {
        // ✅ CRITICAL: Always close dialog, even if there's an error
        if (dialogOpened) {
            try {
                // Use the unified closeCommentDialog function
                await closeCommentDialog(page);
            } catch (closeError) {
                console.warn(`      ⚠️ Error closing dialog: ${closeError.message}`);
                // Last resort: Press Escape multiple times
                try {
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(300);
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(300);
                } catch (e) {
                    console.warn(`      ⚠️ Failed to force close dialog`);
                }
            }
        }
    }
}

/**
 * ✅ NEW: Close Comment Dialog (Act Like Human)
 * Clicks the X button to close the comment dialog
 */
async function closeCommentDialog(page) {
    try {
        console.log(`      🔲 Closing comment dialog...`);

        // Strategy 1: Click close button (X button) - ACT LIKE HUMAN
        const closeButtonSelectors = [
            // Priority 1: Exact from user's HTML (aria-label="Close")
            'div[role="dialog"] div[aria-label="Close"][role="button"]',
            // Priority 2: Without dialog parent
            'div[aria-label="Close"][role="button"]',
            // Priority 3: SVG path inside close button
            'div[role="dialog"] div[role="button"]:has(svg path[d*="19.884"])',
            // Priority 4: Generic close button patterns
            'div[role="dialog"] div[role="button"][aria-label*="lose"]',
        ];

        let closed = false;

        for (const selector of closeButtonSelectors) {
            try {
                const closeBtn = page.locator(selector).first();

                if (await closeBtn.count() > 0) {
                    console.log(`         -> Found close button with: ${selector.substring(0, 60)}...`);

                    // Scroll into view
                    await closeBtn.scrollIntoViewIfNeeded().catch(() => {});
                    await page.waitForTimeout(300);

                    // Try multiple click methods (act like human)
                    try {
                        await closeBtn.click({ timeout: 3000 });
                        closed = true;
                    } catch (e1) {
                        try {
                            await closeBtn.click({ force: true, timeout: 3000 });
                            closed = true;
                        } catch (e2) {
                            await closeBtn.evaluate(el => el.click());
                            closed = true;
                        }
                    }

                    if (closed) {
                        await page.waitForTimeout(500);
                        console.log(`         ✅ Dialog closed via X button`);

                        // Verify dialog is gone
                        const dialogStillExists = await page.locator('div[role="dialog"]').count() > 0;
                        if (!dialogStillExists) {
                            return true;
                        } else {
                            console.log(`         ⚠️ Dialog still exists after click, trying next method...`);
                            closed = false;
                        }
                    }
                }
            } catch (e) {
                console.log(`         -> Close button selector failed: ${e.message.substring(0, 40)}`);
                continue;
            }
        }

        // Strategy 2: Press Escape key (fallback)
        if (!closed) {
            console.log(`         -> Using Escape key fallback...`);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);

            const dialogStillExists = await page.locator('div[role="dialog"]').count() > 0;
            if (!dialogStillExists) {
                console.log(`         ✅ Dialog closed via Escape key`);
                return true;
            }

            // Double escape (sometimes needed)
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            console.log(`         ✅ Dialog closed via double Escape`);
            return true;
        }

        return closed;
    } catch (error) {
        console.warn(`         ⚠️ Error closing dialog: ${error.message.substring(0, 50)}`);
        // Last resort: force escape
        try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
        } catch (e) {}
        return false;
    }
}

/**
 * ✅ Extract All Comments - Hybrid Mode (GraphQL first, HTML fallback)
 */
async function extractAllCommentsHybrid(page, postEl, postUrl, postAuthor, postId) {
    if (!CONFIG.EXTRACT_COMMENTS) return [];

    console.log(`      💬 Extracting comments (hybrid mode, postId: ${postId})...`);

    let comments = [];
    let graphqlResponse = null;
    let dialogOpened = false;

    // ✅ STEP 0: Check and close any existing dialog from previous post
    const existingDialog = await page.locator('div[role="dialog"]').count();
    if (existingDialog > 0) {
        console.log(`      ⚠️  Found open dialog from previous post, closing...`);
        await closeCommentDialog(page);
        await page.waitForTimeout(500); // Extra wait for dialog to fully close
    }

    // ✅ STEP 1: Try to open comment dialog to trigger GraphQL request
    if (CONFIG.PREFER_GRAPHQL) {
        console.log(`      🔍 Attempting to open comment dialog to trigger GraphQL...`);

        const commentButtonSelectors = [
            'span.xkrqix3.x1sur9pj:has-text("comment")',
            'span:has-text("comment")',
            'div[role="button"]:has(span:has-text("comment"))',
        ];

        for (const selector of commentButtonSelectors) {
            try {
                const commentBtn = postEl.locator(selector).first();

                if (await commentBtn.count() > 0) {
                    await commentBtn.scrollIntoViewIfNeeded().catch(() => {});
                    await page.waitForTimeout(500);

                    const parentButton = postEl.locator('div[role="button"]:has(span:has-text("comment"))').first();

                    if (await parentButton.count() > 0) {
                        await parentButton.click({ timeout: 5000 });
                        console.log(`      ✅ Comment button clicked`);

                        // Wait for GraphQL response to be captured
                        await page.waitForTimeout(3000);

                        // Verify dialog opened
                        const dialog = page.locator('div[role="dialog"]').first();
                        if (await dialog.count() > 0) {
                            dialogOpened = true;
                            console.log(`      ✅ Comment dialog opened`);
                            break;
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }

        if (dialogOpened) {
            console.log(`      ⏳ Waiting for GraphQL response (2s)...`);
            await page.waitForTimeout(2000);
        }
    }

    // ✅ STEP 2: Try to get GraphQL response specific to this post
    if (CONFIG.PREFER_GRAPHQL) {
        // Try multiple post ID formats to find matching response
        const postIdVariants = [
            postId,
            `ZmVlZGJhY2s6${postId}`, // Feedback ID format
            `UzpfSTEwMDA0NDQzODg4OTM3MTo${postId}`, // Story ID format
        ];

        // Log all stored IDs for debugging
        if (commentGraphQLResponseMap.size > 0) {
            const storedIds = Array.from(commentGraphQLResponseMap.keys());
            console.log(`      📋 Stored comment response IDs: ${storedIds.slice(0, 5).join(', ')}${storedIds.length > 5 ? '...' : ''}`);
        }

        for (const variant of postIdVariants) {
            if (commentGraphQLResponseMap.has(variant)) {
                graphqlResponse = commentGraphQLResponseMap.get(variant);
                console.log(`      ✅ Found GraphQL response for postId variant: ${variant}`);
                break;
            }
        }

        // Fallback to latest response if no specific match
        if (!graphqlResponse && latestCommentGraphQLResponse) {
            console.log(`      ℹ️  Using latest GraphQL response (no post-specific match)`);
            graphqlResponse = latestCommentGraphQLResponse;
        }

        if (graphqlResponse) {
            comments = parseCommentsFromGraphQL(graphqlResponse, postUrl, postAuthor);

            if (comments.length > 0) {
                console.log(`      ✅ Using GraphQL comments (${comments.length} total)`);
                trackStrategy('comments', 'hybrid_graphql_success');

                // Close dialog before returning
                if (dialogOpened) {
                    try {
                        await page.keyboard.press('Escape');
                        await page.waitForTimeout(300);
                    } catch (e) {
                        // Ignore
                    }
                }

                return comments;
            } else {
                console.log(`      ⚠️  GraphQL response found but no comments parsed`);
            }
        } else {
            console.log(`      ℹ️  No GraphQL response available (map size: ${commentGraphQLResponseMap.size})`);
        }
    }

    // ✅ STEP 3: Fallback to HTML if GraphQL didn't work
    if (CONFIG.COMPLEMENT_WITH_HTML) {
        console.log(`      ℹ️  GraphQL comments not available, trying HTML extraction...`);

        // If dialog is already opened from GraphQL attempt, use it
        // Otherwise, extractCommentsFromHTML will try to open it
        if (!dialogOpened) {
            comments = await extractCommentsFromHTML(page, postEl, postUrl, postAuthor);
        } else {
            // Dialog already opened, just extract from it
            comments = await extractCommentsFromDialog(page, postUrl, postAuthor);
        }

        if (comments.length > 0) {
            console.log(`      ✅ Using HTML comments (${comments.length} total)`);
            trackStrategy('comments', 'hybrid_html_fallback');
            return comments;
        }
    }

    // Close dialog if still open
    if (dialogOpened) {
        try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
        } catch (e) {
            // Ignore
        }
    }

    console.log(`      ℹ️  No comments extracted`);
    trackStrategy('comments', 'hybrid_no_comments');
    return [];
}

/**
 * ✅ Save Comments to CSV (Realtime)
 */
async function saveCommentsRealtime(comments, commentFile) {
    if (comments.length === 0) return;

    try {
        const fileExists = fs.existsSync(commentFile);

        // Write BOM for Excel compatibility (only if new file)
        if (!fileExists) {
            fs.writeFileSync(commentFile, '\ufeff');
        }

        const commentWriter = createObjectCsvWriter({
            path: commentFile,
            header: [
                {id: 'post_author', title: 'post_author'},
                {id: 'post_url', title: 'post_url'},
                {id: 'comment_id', title: 'comment_id'},
                {id: 'comment_author', title: 'comment_author'},
                {id: 'comment_author_url', title: 'comment_author_url'},
                {id: 'comment_text', title: 'comment_text'},
                {id: 'comment_timestamp', title: 'comment_timestamp'},
                {id: 'comment_timestamp_unix', title: 'comment_timestamp_unix'},
                {id: 'comment_reactions', title: 'comment_reactions'},
                {id: 'comment_replies_count', title: 'comment_replies_count'},
                {id: 'comment_depth', title: 'comment_depth'},
                {id: 'data_source', title: 'data_source'}
            ],
            append: fileExists,
            alwaysQuote: true,
            encoding: 'utf8',
            fieldDelimiter: ',',
        });

        await commentWriter.writeRecords(comments);
        fs.chmodSync(commentFile, CONFIG.FILE_PERMISSIONS);

        console.log(`      💾 Saved ${comments.length} comments to ${commentFile}`);
    } catch (error) {
        console.warn(`      ⚠️ Comment save error: ${error.message}`);
    }
}

/**
 * ✅ Save Comments to JSON (Realtime)
 */
async function saveCommentsRealtimeJSON(comments, jsonFile) {
    if (comments.length === 0) return;

    try {
        let existingData = [];

        // Load existing JSON if file exists
        if (fs.existsSync(jsonFile)) {
            try {
                const fileContent = fs.readFileSync(jsonFile, 'utf8');
                existingData = JSON.parse(fileContent);
                if (!Array.isArray(existingData)) {
                    existingData = [];
                }
            } catch (parseError) {
                console.warn(`      ⚠️ Could not parse existing JSON, starting fresh`);
                existingData = [];
            }
        }

        // Append new comments
        existingData.push(...comments);

        // Write back to file with pretty formatting
        fs.writeFileSync(jsonFile, JSON.stringify(existingData, null, 2), 'utf8');
        fs.chmodSync(jsonFile, CONFIG.FILE_PERMISSIONS);

        console.log(`      💾 Saved ${comments.length} comments to ${jsonFile} (total: ${existingData.length})`);
    } catch (error) {
        console.warn(`      ⚠️ Comment JSON save error: ${error.message}`);
    }
}

// ============================================================================
// ✅ DATABASE SAVE FUNCTIONS - Auto-save to PostgreSQL
// ============================================================================

/**
 * ✅ Save Single Post to Database via API
 */
async function savePostToDatabase(post) {
    if (!isApiAvailable) {
        return false; // Skip if API not available
    }

    try {
        const response = await axios.post(
            `${CONFIG.API_BASE_URL}/api/posts/save`,
            post,
            { timeout: CONFIG.API_TIMEOUT }
        );

        if (response.data.success) {
            return true;
        } else {
            console.error(`      ⚠️  API save error: ${response.data.error}`);
            return false;
        }
    } catch (error) {
        console.error(`      ⚠️  API request error: ${error.message}`);
        return false;
    }
}

/**
 * ✅ Save Comments to Database via API
 */
async function saveCommentsToDatabase(comments) {
    if (!isApiAvailable || comments.length === 0) {
        return false;
    }

    try {
        const response = await axios.post(
            `${CONFIG.API_BASE_URL}/api/comments/save`,
            { comments },
            { timeout: CONFIG.API_TIMEOUT }
        );

        if (response.data.success) {
            return response.data.saved;
        } else {
            console.error(`      ⚠️  API save error: ${response.data.error}`);
            return false;
        }
    } catch (error) {
        console.error(`      ⚠️  API request error: ${error.message}`);
        return false;
    }
}

/**
 * ✅ Save Posts to JSON (Realtime)
 */
async function savePostsRealtimeJSON(posts, jsonFile) {
    if (posts.length === 0) return;

    try {
        let existingData = [];

        // Load existing JSON if file exists
        if (fs.existsSync(jsonFile)) {
            try {
                const fileContent = fs.readFileSync(jsonFile, 'utf8');
                existingData = JSON.parse(fileContent);
                if (!Array.isArray(existingData)) {
                    existingData = [];
                }
            } catch (parseError) {
                console.warn(`      ⚠️ Could not parse existing JSON, starting fresh`);
                existingData = [];
            }
        }

        // Append new posts
        existingData.push(...posts);

        // Write back to file with pretty formatting
        fs.writeFileSync(jsonFile, JSON.stringify(existingData, null, 2), 'utf8');
        fs.chmodSync(jsonFile, CONFIG.FILE_PERMISSIONS);

        console.log(`      💾 Saved ${posts.length} posts to ${jsonFile} (total: ${existingData.length})`);
    } catch (error) {
        console.warn(`      ⚠️ Post JSON save error: ${error.message}`);
    }
}

/**
 * Debug pause
 */
async function debugPause(message) {
    if (CONFIG.DEBUG_MODE) {
        console.log(`\n🔍 DEBUG PAUSE: ${message}`);
        console.log("Tekan Enter untuk melanjutkan...");
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
    }
}

/**
 * Human-like delay
 */
async function humanDelay(minMs = 800, maxMs = 2000) {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Human-like mouse movement and click
 */
async function humanClick(page, element) {
    try {
        await element.scrollIntoViewIfNeeded().catch(() => {});
        await humanDelay(300, 700);
        
        const box = await element.boundingBox();
        if (box) {
            const x = box.x + (box.width * 0.3) + Math.random() * (box.width * 0.4);
            const y = box.y + (box.height * 0.3) + Math.random() * (box.height * 0.4);
            await page.mouse.move(x, y, { steps: 8 + Math.floor(Math.random() * 8) });
            await humanDelay(200, 500);
        }
        
        await element.click({ timeout: 5000 });
        await humanDelay(500, 1000);
        
        return true;
    } catch (e) {
        console.warn(`   ⚠️ Human click error: ${e.message.substring(0, 50)}`);
        return false;
    }
}

/**
 * Click "All" tab to expand filter options
 */
async function clickAllTab(page) {
    try {
        console.log("   🎯 Clicking 'All' tab to expand filters...");
        
        const allTabSelectors = [
            'a[href*="/search/top/"][href*="__eps__=SERP_POSTS_TAB"]',
            'a[href*="/search/top/"][role="link"]:has-text("All")',
            'a[role="link"]:has(span:text-is("All"))',
            'a[href*="/search/top/"][aria-current="page"]',
            'a:has-text("All")[role="link"]',
            'span:text-is("All")',
            'a[href*="/search/top/"][role="link"]',
            'a[role="link"]:has-text("All")',
        ];
        
        for (const selector of allTabSelectors) {
            try {
                const allTab = page.locator(selector).first();
                
                const count = await allTab.count();
                if (count === 0) {
                    continue;
                }
                
                console.log(`      -> Trying selector: ${selector}`);
                
                await allTab.waitFor({ state: 'visible', timeout: 10000 });
                await allTab.scrollIntoViewIfNeeded();
                await humanDelay(1000, 1500);
                
                let clickSuccess = false;
                
                try {
                    await allTab.click({ timeout: 10000 });
                    clickSuccess = true;
                } catch (clickErr1) {
                    console.log(`         Regular click failed, trying force click...`);
                    
                    try {
                        await allTab.click({ force: true, timeout: 10000 });
                        clickSuccess = true;
                    } catch (clickErr2) {
                        console.log(`         Force click failed, trying humanClick...`);
                        clickSuccess = await humanClick(page, allTab);
                    }
                }
                
                if (clickSuccess) {
                    await humanDelay(2000, 3000);
                    console.log("   ✅ 'All' tab clicked, filters should be visible");
                    return true;
                }
                
            } catch (e) {
                console.log(`      -> Failed with selector: ${selector} (${e.message.substring(0, 30)}...)`);
                continue;
            }
        }
        
        console.log("   ℹ️ 'All' tab already active or not found");
        return false;
    } catch (error) {
        console.warn(`   ⚠️ Error clicking All tab: ${error.message}`);
        return false;
    }
}

/**
 * Enable Recent Posts toggle
 */
async function enableRecentPosts(page) {
    try {
        console.log("   🔄 Enabling 'Recent posts' toggle...");
        
        await clickAllTab(page);
        await humanDelay(1500, 2500);
        
        const recentPostsSelectors = [
            'input[aria-label="Recent posts"][role="switch"]',
            'input[aria-label="Recent posts"][type="checkbox"]',
            'div[role="switch"]:has-text("Recent posts")',
        ];
        
        for (const selector of recentPostsSelectors) {
            try {
                const toggle = page.locator(selector).first();
                const count = await toggle.count();
                
                if (count > 0) {
                    const isChecked = await toggle.getAttribute('aria-checked');
                    
                    if (isChecked === 'false') {
                        await toggle.scrollIntoViewIfNeeded().catch(() => {});
                        await humanDelay(500, 1000);
                        await toggle.click({ timeout: 5000 });
                        await humanDelay(1500, 2000);
                        console.log("   ✅ 'Recent posts' enabled");
                        return true;
                    } else {
                        console.log("   ℹ️ 'Recent posts' already enabled");
                        return true;
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        console.log("   ℹ️ 'Recent posts' toggle not found");
        return false;
    } catch (error) {
        console.warn(`   ⚠️ Error enabling recent posts: ${error.message}`);
        return false;
    }
}

/**
 * Apply date filter
 */
async function applyDateFilter(page, year) {
    try {
        console.log(`\n📅 Applying date filter: ${year}`);
        
        await clickAllTab(page);
        await humanDelay(1500, 2500);
        
        console.log("   -> Looking for 'Date posted' dropdown...");
        
        const datePostedSelectors = [
            'div[role="combobox"][aria-label*="Date posted"]',
            'div[aria-label*="Filter by Date posted"]',
            'div:has-text("Date posted")[role="combobox"]',
        ];
        
        let datePostedButton = null;
        for (const selector of datePostedSelectors) {
            try {
                const btn = page.locator(selector).first();
                await btn.waitFor({ state: 'visible', timeout: 5000 });
                if (await btn.count() > 0) {
                    datePostedButton = btn;
                    console.log(`   ✓ Found with selector: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!datePostedButton) {
            console.log("   ⚠️ Date posted button not found after clicking All tab");
            return false;
        }
        
        console.log("   -> Clicking 'Date posted' dropdown...");
        const clickSuccess = await humanClick(page, datePostedButton);
        if (!clickSuccess) {
            console.log("   ⚠️ Failed to click Date posted button");
            return false;
        }
        
        await humanDelay(2000, 3000);
        
        try {
            await page.waitForSelector('div[role="listbox"]', { timeout: 5000 });
            console.log("   -> Dropdown opened successfully");
            await humanDelay(1500, 2000);
        } catch (e) {
            console.log("   ⚠️ Dropdown menu did not appear");
            return false;
        }
        
        console.log(`   -> Looking for year ${year} option...`);
        
        try {
            const yearOption = page.locator(`div[role="option"]:has(span:text-is("${year}"))`).first();
            await yearOption.waitFor({ state: 'visible', timeout: 5000 });
            console.log(`   -> Found year ${year} via role="option"`);
            await yearOption.scrollIntoViewIfNeeded({ timeout: 3000 });
            await humanDelay(500, 1000);
            
            try {
                await yearOption.click({ timeout: 10000, trial: true });
                await yearOption.click({ timeout: 10000 });
                console.log(`   ✅ Clicked year ${year} successfully`);
                await humanDelay(2500, 3500);
                
                const filterApplied = await page.locator(`[aria-label*="${year}"]`).count() > 0;
                if (filterApplied) {
                    console.log(`   ✅ Date filter ${year} applied successfully`);
                    return true;
                } else {
                    console.log(`   ⚠️ Could not verify filter, but continuing...`);
                    return true;
                }
            } catch (clickError) {
                console.log(`   ⚠️ Regular click failed: ${clickError.message.substring(0, 50)}`);
                throw clickError;
            }
            
        } catch (error1) {
            console.log(`   -> Strategy 1 failed, trying keyboard navigation...`);
            
            try {
                const yearOption = page.locator(`div[role="option"][tabindex="0"]:has(span:text-is("${year}"))`).first();
                if (await yearOption.count() > 0) {
                    await yearOption.focus();
                    await humanDelay(500, 1000);
                    await page.keyboard.press('Enter');
                    console.log(`   ✅ Selected year ${year} via keyboard`);
                    await humanDelay(2500, 3500);
                    return true;
                } else {
                    throw new Error("Option not found");
                }
            } catch (error2) {
                console.log(`   -> Strategy 2 failed, trying force click...`);
                
                try {
                    const yearOption = page.locator(`div[role="option"]:has(span:text-is("${year}"))`).first();
                    await yearOption.scrollIntoViewIfNeeded();
                    await humanDelay(1000, 1500);
                    await yearOption.click({ force: true, timeout: 10000 });
                    console.log(`   ✅ Force clicked year ${year}`);
                    await humanDelay(2500, 3500);
                    return true;
                } catch (error3) {
                    console.log(`   -> Strategy 3 failed, trying direct span click...`);
                    
                    try {
                        const yearSpan = page.locator(`div[role="listbox"] span:text-is("${year}")`).first();
                        await yearSpan.waitFor({ state: 'visible', timeout: 5000 });
                        await yearSpan.scrollIntoViewIfNeeded();
                        await humanDelay(1000, 1500);
                        await yearSpan.click({ timeout: 10000 });
                        console.log(`   ✅ Clicked year ${year} span directly`);
                        await humanDelay(2500, 3500);
                        return true;
                    } catch (error4) {
                        console.error(`   ❌ All strategies failed: ${error4.message}`);
                        await page.keyboard.press('Escape');
                        return false;
                    }
                }
            }
        }
        
    } catch (error) {
        console.error(`   ❌ Error applying date filter: ${error.message}`);
        await page.keyboard.press('Escape').catch(() => {});
        return false;
    }
}

/**
 * Clear date filter
 */
async function clearDateFilter(page) {
    try {
        console.log("   🧹 Clearing date filter...");
        
        const clearButtonSelectors = [
            'div[aria-label="Clear Date posted Filter"][role="button"]',
            'div[aria-label*="Clear Date posted"]',
            'div[aria-label*="Clear"][aria-label*="Filter"]',
            'div:has-text("Clear")[role="button"]',
        ];
        
        for (const selector of clearButtonSelectors) {
            try {
                const clearButton = page.locator(selector).first();
                const count = await clearButton.count();
                
                if (count > 0) {
                    console.log(`      -> Found clear button with: ${selector}`);
                    await clearButton.scrollIntoViewIfNeeded().catch(() => {});
                    await humanDelay(500, 1000);
                    
                    let clicked = false;
                    
                    try {
                        await clearButton.click({ timeout: 5000 });
                        clicked = true;
                    } catch (e1) {
                        try {
                            await clearButton.click({ force: true, timeout: 5000 });
                            clicked = true;
                        } catch (e2) {
                            clicked = await humanClick(page, clearButton);
                        }
                    }
                    
                    if (clicked) {
                        await humanDelay(2000, 3000);
                        console.log("   ✅ Date filter cleared successfully");
                        return true;
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        console.log("   ℹ️ No active filter to clear");
        return true;
    } catch (error) {
        console.warn(`   ⚠️ Error clearing filter: ${error.message}`);
        return false;
    }
}

/**
 * Login ke Facebook
 */
async function loginToFacebook(page, username, password) {
    try {
        console.log("🔐 Mencoba login ke Facebook...");
        
        try {
            const cookieButton = page.locator(
                'button[data-testid="cookie-policy-manage-dialog-accept-button"], button:has-text("Allow all cookies")'
            ).first();
            await cookieButton.waitFor({ state: 'visible', timeout: 5000 });
            await cookieButton.click();
            console.log("✅ Cookie banner ditutup.");
        } catch (e) {
            console.log("ℹ️ Tidak ada cookie banner.");
        }
        
        await page.fill('#email', username);
        await page.fill('#pass', password);
        console.log("✅ Email & Password dimasukkan.");
        
        await page.getByRole('button', { name: 'Log in' }).click();
        console.log("⏳ Menunggu navigasi... (Maks 2 menit)");
        console.log("🔥🔥 PENTING: Selesaikan 2FA/CAPTCHA jika diminta SEKARANG!");
        
        await page.waitForSelector('a[aria-label="Home"]', { timeout: 120000 });
        console.log("🎉 Login berhasil!");
        return true;
    } catch (error) {
        console.error(`❌ Gagal login: ${error.message}`);
        await page.screenshot({ path: 'facebook_login_gagal.png' });
        return false;
    }
}

/**
 * Extract Location dari post
 */
async function extractLocation(postEl) {
    try {
        // ✅ Strategy 1: Nested span location format (new)
        // <b class="html-b..."><span class="html-span..."><a href="..."><span class="xt0psk2"><span class="xjp7ctv"><span>Jakarta</span>
        const nestedLocationLinks = await postEl.locator('b.html-b span.html-span a[href*="facebook.com"]').all();

        for (const link of nestedLocationLinks) {
            const href = await link.getAttribute('href');
            const text = await link.textContent();

            // Check if it's a location page (not profile or other pages)
            if (href && text && text.trim().length > 0 && text.trim().length < 50) {
                // Exclude common non-location patterns
                if (!href.includes('/profile.php') && !href.includes('/photo/') && !href.includes('/groups/')) {
                    const cleanLocation = cleanTextForCSV(text.trim());
                    console.log(`      -> Location (nested): ${cleanLocation}`);
                    trackStrategy('location', 'nested_span_selector');
                    return cleanLocation;
                }
            }
        }

        // ✅ Strategy 2: Pages link format (existing)
        const locationSelectors = [
            'a[href*="/pages/"]:not([href*="__cft__"])',
            'a[href*="/pages/"][role="link"]',
            'div.xu06os2 a[href*="/pages/"]',
        ];

        for (const selector of locationSelectors) {
            const locationLinks = await postEl.locator(selector).all();

            for (const link of locationLinks) {
                const href = await link.getAttribute('href');
                const text = await link.textContent();

                if (href && href.includes('/pages/') && text && text.trim().length > 0) {
                    const cleanLocation = cleanTextForCSV(text.trim());

                    if (cleanLocation.length < 50) {
                        console.log(`      -> Location (pages): ${cleanLocation}`);
                        trackStrategy('location', 'pages_link_selector');
                        return cleanLocation;
                    }
                }
            }
        }

        console.log(`      -> No location found`);
        return "N/A";

    } catch (e) {
        console.warn(`      ⚠️ Error extract location: ${e.message.substring(0, 40)}`);
        return "N/A";
    }
}

/**
 * ✅ NEW: Extract Music (song title and artist) from post
 */
async function extractMusic(postEl) {
    try {
        // Music indicator: icon with music background image
        // Structure: <a><div><i style="background-image..."></i></div><span>Title</span><span> · </span><span>Artist</span></a>

        // Find all links that contain music icon
        const musicLinks = await postEl.locator('a').all();

        for (const link of musicLinks) {
            // Check if this link contains a music icon
            const musicIcon = link.locator('i[data-visualcompletion="css-img"]').first();
            if (await musicIcon.count() === 0) continue;

            const style = await musicIcon.getAttribute('style').catch(() => '');
            if (!style.includes('background-image')) continue;

            // Extract text spans with the specific class pattern
            const textSpans = await link.locator('span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.x1xmvt09.x1nxh6w3.x1sibtaa.x1s688f.xi81zsa').all();

            if (textSpans.length >= 2) {
                const title = await textSpans[0].textContent();
                const artist = await textSpans[1].textContent();

                if (title && artist && title.trim().length > 0 && artist.trim().length > 0) {
                    const cleanTitle = cleanTextForCSV(title.trim());
                    const cleanArtist = cleanTextForCSV(artist.trim());

                    console.log(`      -> Music: "${cleanTitle}" by ${cleanArtist}`);
                    trackStrategy('music', 'icon_based_selector');

                    return {
                        music_title: cleanTitle,
                        music_artist: cleanArtist
                    };
                }
            }
        }

        console.log(`      -> No music found`);
        return {
            music_title: 'N/A',
            music_artist: 'N/A'
        };

    } catch (e) {
        console.warn(`      ⚠️ Error extract music: ${e.message.substring(0, 40)}`);
        return {
            music_title: 'N/A',
            music_artist: 'N/A'
        };
    }
}

/**
 * Extract Views (khusus untuk video posts)
 */
async function extractViews(postEl) {
    try {
        // ========== ✅ NEW STRATEGY 0: _26fq CLASS FORMAT (HIGHEST PRIORITY) ==========
        const views26fq = postEl.locator('span._26fq span.x193iq5w:has-text("views")').first();
        if (await views26fq.count() > 0) {
            const text = await views26fq.textContent();
            if (text && text.toLowerCase().includes('view')) {
                const match = text.match(/(\d+[\d,.]*(K|k|M|m)?)\s*views?/i);
                if (match) {
                    const count = parseEngagementCount(match[1]);
                    if (count > 0) {
                        console.log(`      -> Views (_26fq): ${count}`);
                        trackStrategy('views', '_26fq_class_format'); // ✅ TAMBAH
                        return count;
                    }
                }
            }
        }

        const viewsSelectors = [
            'span.x193iq5w.xeuugli:has-text("views")',
            'span[dir="auto"]:has-text("views")',
            'span:has-text("views")',
        ];
        
        for (const selector of viewsSelectors) {
            const viewSpans = await postEl.locator(selector).all();
            for (const span of viewSpans) {
                const text = await span.textContent();
                if (text && text.toLowerCase().includes('view')) {
                    const match = text.match(/(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)\s*views?/i);
                    if (match) {
                        const count = parseEngagementCount(match[1]);
                        if (count > 0) {
                            console.log(`      -> Views: ${count}`);
                            trackStrategy('views', 'selector_' + viewsSelectors.indexOf(selector)); // ✅ TAMBAH
                            return count;
                        }
                    }
                }
            }
        }
        
        const allTexts = await postEl.locator('span, div').allTextContents();
        for (const text of allTexts) {
            if (!text) continue;
            const match = text.match(/(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)\s*views?/i);
            if (match) {
                const count = parseEngagementCount(match[1]);
                if (count > 0) {
                    console.log(`      -> Views: ${count}`);
                    trackStrategy('views', 'fallback_all_text'); // ✅ TAMBAH
                    return count;
                }
            }
        }
        
    } catch (e) {
        console.warn(`      ⚠️ Error extract views: ${e.message.substring(0, 40)}`);
    }
    
    return 0;
}


/**
 * ✅ NEW: Extract Views by opening video page in new tab
 */
async function extractVideoViewsFromPage(context, videoUrl) {
    if (!videoUrl || videoUrl === "N/A") return 0;
    
    let videoTab = null;
    
    try {
        console.log(`         -> Opening video page to extract views...`);
        
        // Open in new tab
        videoTab = await context.newPage();

        await videoTab.goto(videoUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        }).catch(() => null);

        // ✅ Set zoom level
        await setPageZoom(videoTab);
        
        await videoTab.waitForTimeout(3000);
        
        // Wait for video player to load
        await videoTab.waitForSelector('video, div[role="main"]', { timeout: 10000 }).catch(() => {});
        await videoTab.waitForTimeout(2000);
        
        // ========== EXTRACT VIEWS ==========
        const viewsSelectors = [
            // Primary selector dari HTML yang diberikan
            'span.html-span:has(span:has-text("views"))',
            'span._26fq:has-text("views")',
            'span:has(span:text-matches("\\d+[KkMm]?\\s*views"))',
            // Fallback selectors
            'span.x193iq5w:has-text("views")',
            'span:text-matches("\\d+[KkMm]?\\s*views")',
            'div:has-text("views")',
        ];
        
        for (const selector of viewsSelectors) {
            try {
                const viewSpans = await videoTab.locator(selector).all();
                
                for (const span of viewSpans) {
                    const text = await span.textContent();
                    
                    if (text && text.toLowerCase().includes('view')) {
                        // Match pattern: "38K views", "1.2M views", "500 views"
                        const match = text.match(/(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)\s*views?/i);
                        
                        if (match) {
                            const count = parseEngagementCount(match[1]);
                            
                            if (count > 0) {
                                console.log(`         ✅ Views extracted: ${count} (${match[0]})`);
                                return count;
                            }
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        // Fallback: search all text content
        const allTexts = await videoTab.locator('span, div').allTextContents();
        for (const text of allTexts) {
            if (!text) continue;
            
            const match = text.match(/(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)\s*views?/i);
            if (match) {
                const count = parseEngagementCount(match[1]);
                if (count > 0) {
                    console.log(`         ✅ Views extracted (fallback): ${count}`);
                    return count;
                }
            }
        }
        
        console.log(`         -> Views not found on video page`);
        return 0;
        
    } catch (error) {
        console.warn(`         ⚠️ Error extracting views from page: ${error.message.substring(0, 50)}`);
        return 0;
        
    } finally {
        // ALWAYS close tab
        if (videoTab && !videoTab.isClosed()) {
            await videoTab.close().catch(() => {});
            console.log(`         -> Video tab closed`);
        }
    }
}


/**
 * ✅ NEW: Extract Engagement from Reel Page in New Tab
 */
async function extractReelEngagementFromPage(context, reelUrl) {
    if (!reelUrl || reelUrl === "N/A") {
        return { reactions: 0, comments: 0, shares: 0 };
    }
    
    let reelTab = null;
    
    try {
        console.log(`         -> Opening reel page to extract engagement...`);
        
        // Open in new tab
        reelTab = await context.newPage();

        await reelTab.goto(reelUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        }).catch(() => null);

        // ✅ Set zoom level
        await setPageZoom(reelTab);
        
        await reelTab.waitForTimeout(3000);
        
        // Wait for reel player to load
        await reelTab.waitForSelector('video, div[role="main"]', { timeout: 10000 }).catch(() => {});
        await reelTab.waitForTimeout(2000);
        
        let reactions = 0, comments = 0, shares = 0;
        
        // ========== EXTRACT REACTIONS ==========
        const reactionSelectors = [
            // Primary: Exact match dari HTML
            'div[aria-label="Like"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft.x1j85h84',
            'div[aria-label="Like"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6',
            // Fallback
            'div[aria-label="Like"] span.x1lliihq',
            'div[aria-label="Like"] span[dir="auto"]',
        ];
        
        for (const selector of reactionSelectors) {
            try {
                const reactionSpan = await reelTab.locator(selector).first();
                if (await reactionSpan.count() > 0) {
                    const text = await reactionSpan.textContent();
                    if (text && text.match(/\d/)) {
                        reactions = parseEngagementCount(text);
                        if (reactions > 0) {
                            console.log(`         ✅ Reactions extracted: ${reactions} (${text})`);
                            break;
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        // ========== EXTRACT COMMENTS ==========
        const commentSelectors = [
            // Primary: Exact match dari HTML
            'div[aria-label="Comment"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft.x1j85h84',
            'div[aria-expanded="false"][aria-label="Comment"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6',
            // Fallback
            'div[aria-label="Comment"] span.x1lliihq',
            'div[aria-label="Comment"] span[dir="auto"]',
        ];
        
        for (const selector of commentSelectors) {
            try {
                const commentSpan = await reelTab.locator(selector).first();
                if (await commentSpan.count() > 0) {
                    const text = await commentSpan.textContent();
                    if (text && text.match(/\d/)) {
                        comments = parseEngagementCount(text);
                        if (comments > 0) {
                            console.log(`         ✅ Comments extracted: ${comments} (${text})`);
                            break;
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        // ========== EXTRACT SHARES ==========
        const shareSelectors = [
            // Primary: Exact match dari HTML
            'div[aria-label="Share"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft.x1j85h84',
            'div[aria-label="Share"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6',
            // Fallback
            'div[aria-label="Share"] span.x1lliihq',
            'div[aria-label="Share"] span[dir="auto"]',
        ];
        
        for (const selector of shareSelectors) {
            try {
                const shareSpan = await reelTab.locator(selector).first();
                if (await shareSpan.count() > 0) {
                    const text = await shareSpan.textContent();
                    if (text && text.match(/\d/)) {
                        shares = parseEngagementCount(text);
                        if (shares > 0) {
                            console.log(`         ✅ Shares extracted: ${shares} (${text})`);
                            break;
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        // If still no data, try broader search
        if (reactions === 0 && comments === 0 && shares === 0) {
            console.log(`         -> Trying broader search for engagement...`);
            
            const allButtons = await reelTab.locator('div[role="button"]').all();
            
            for (const button of allButtons) {
                try {
                    const ariaLabel = await button.getAttribute('aria-label');
                    
                    if (ariaLabel) {
                        const spans = await button.locator('span.x1lliihq').all();
                        
                        for (const span of spans) {
                            const text = await span.textContent();
                            if (text && text.match(/\d/)) {
                                const count = parseEngagementCount(text);
                                
                                if (count > 0) {
                                    if (ariaLabel.toLowerCase().includes('like') && reactions === 0) {
                                        reactions = count;
                                        console.log(`         ✅ Reactions found (broader): ${reactions}`);
                                    } else if (ariaLabel.toLowerCase().includes('comment') && comments === 0) {
                                        comments = count;
                                        console.log(`         ✅ Comments found (broader): ${comments}`);
                                    } else if (ariaLabel.toLowerCase().includes('share') && shares === 0) {
                                        shares = count;
                                        console.log(`         ✅ Shares found (broader): ${shares}`);
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        }
        
        if (reactions === 0 && comments === 0 && shares === 0) {
            console.log(`         -> No engagement found on reel page`);
        }
        
        return { reactions, comments, shares };
        
    } catch (error) {
        console.warn(`         ⚠️ Error extracting engagement from reel: ${error.message.substring(0, 50)}`);
        return { reactions: 0, comments: 0, shares: 0 };
        
    } finally {
        // ALWAYS close tab
        if (reelTab && !reelTab.isClosed()) {
            await reelTab.close().catch(() => {});
            console.log(`         -> Reel tab closed`);
        }
    }
}


/**
 * ✅ ENHANCED: Extract Reactions with MULTIPLE REEL formats
 */
async function extractReactions(postEl, page, postIndex, screenshotOnFail = false) {
    try {

        // ========== ✅ NEW STRATEGY 00: VIDEO POST FEED FORMAT (HIGHEST PRIORITY) ==========
        const videoFeedReaction = postEl.locator('span.xt0b8zv span.html-span.xdj266r.x14z9mp').first();
        if (await videoFeedReaction.count() > 0) {
            const text = await videoFeedReaction.textContent();
            if (text && text.match(/\d/)) {
                const count = parseEngagementCount(text);
                if (count > 0) {
                    console.log(`      -> Reactions (video feed): ${count}`);
                    trackStrategy('reactions', 'video_feed_format'); // ✅ TAMBAH INI
                    return count;
                }
            }
        }
        // ========== STRATEGY 0A: REEL NEW FORMAT (PRIORITY) ==========
        // Dari inspect element yang baru: aria-label="Like" dengan span nested
        const reelLikeNew = postEl.locator('div[aria-label="Like"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6').first();
        if (await reelLikeNew.count() > 0) {
            const text = await reelLikeNew.textContent();
            if (text && text.match(/\d/)) {
                const count = parseEngagementCount(text);
                if (count > 0) {
                    console.log(`      -> Reactions (reel new): ${count}`);
                    trackStrategy('reactions', 'reel_new_format'); // ✅ TAMBAH INI
                    return count;
                }
            }
        }
        
        // ========== STRATEGY 0B: REEL OLD FORMAT ==========
        const reelLikeOld = postEl.locator('div[aria-label="Like"][role="button"] span.x1lliihq').first();
        if (await reelLikeOld.count() > 0) {
            const text = await reelLikeOld.textContent();
            if (text && text.match(/\d/)) {
                const count = parseEngagementCount(text);
                if (count > 0) {
                    console.log(`      -> Reactions (reel old): ${count}`);
                    trackStrategy('reactions', 'reel_like_button_old'); // ✅ TAMBAH
                    return count;
                }
            }
        }

        // ========== EXISTING STRATEGIES (keep all) ==========
        const allReactionsDiv = postEl.locator('div:has-text("All reactions:")').first();
        if (await allReactionsDiv.count() > 0) {
            const countSpan = allReactionsDiv.locator('span.xt0b8zv.x135b78x, span.x135b78x').first();
            if (await countSpan.count() > 0) {
                const text = await countSpan.textContent();
                const count = parseEngagementCount(text);
                if (count > 0) {
                    trackStrategy('reactions', 'all_reactions_div'); // ✅ TAMBAH
                    return count;
                }
            }
        }

        const reactionButton = postEl.locator('div[role="button"]:has-text("All reactions")').first();
        if (await reactionButton.count() > 0) {
            const spans = await reactionButton.locator('span.xt0b8zv, span.x135b78x').all();
            for (const span of spans) {
                const text = await span.textContent();
                if (text && text.match(/\d/)) {
                    const count = parseEngagementCount(text);
                    if (count > 0) {
                        trackStrategy('reactions', 'reaction_button_spans'); // ✅ TAMBAH
                        return count;
                    }
                }
            }
        }

        const ariaLabelEl = postEl.locator('span[aria-label*="reactions"], span[aria-label*="reaction"]').first();
        if (await ariaLabelEl.count() > 0) {
            const ariaLabel = await ariaLabelEl.getAttribute('aria-label');
            if (ariaLabel) {
                const count = parseEngagementCount(ariaLabel);
                if (count > 0) {
                    trackStrategy('reactions', 'aria_label_attribute'); // ✅ TAMBAH
                    return count;
                }
            }
        }
        
        if (screenshotOnFail && page && postIndex !== undefined) {
            const timestamp = Date.now();
            const filename = `error_reactions_post${postIndex}_${timestamp}.png`;
            await postEl.screenshot({ path: filename }).catch(() => {});
        }
    } catch (e) {
        console.warn(`       ⚠️ Error extract reactions: ${e.message.substring(0, 40)}`);
    }
    
    return 0;
}

/**
 * ✅ ENHANCED: Extract Comments with MULTIPLE REEL formats
 */
async function extractComments(postEl, page, postIndex, screenshotOnFail = false) {
    try {

        // ========== ✅ NEW STRATEGY 00: DIRECT COMMENTS TEXT (HIGHEST PRIORITY) ==========
        const directCommentSpan = postEl.locator('span.html-span.xkrqix3.x1sur9pj:has-text("comment")').first();
        if (await directCommentSpan.count() > 0) {
            const text = await directCommentSpan.textContent();
            if (text && text.match(/\d/)) {
                const match = text.match(/(\d+[\d,.]*(K|k|M|m)?)\s*comment/i);
                if (match) {
                    const count = parseEngagementCount(match[1]);
                    if (count > 0) {
                        console.log(`      -> Comments (direct): ${count}`);
                        trackStrategy('comments', 'direct_comment_span'); // ✅ TAMBAH
                        return count;
                    }
                }
            }
        }

        // ========== STRATEGY 0A: REEL NEW FORMAT (PRIORITY) ==========
        const reelCommentNew = postEl.locator('div[aria-label="Comment"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6').first();
        if (await reelCommentNew.count() > 0) {
            const text = await reelCommentNew.textContent();
            if (text && text.match(/\d/)) {
                const count = parseEngagementCount(text);
                if (count > 0) {
                    console.log(`      -> Comments (reel new): ${count}`);
                    trackStrategy('comments', 'reel_comment_button_new'); // ✅ TAMBAH
                    return count;
                }
            }
        }
        
        // ========== STRATEGY 0B: REEL OLD FORMAT ==========
        const reelCommentOld = postEl.locator('div[aria-label="Comment"] span.x1lliihq').first();
        if (await reelCommentOld.count() > 0) {
            const text = await reelCommentOld.textContent();
            if (text && text.match(/\d/)) {
                const count = parseEngagementCount(text);
                if (count > 0) {
                    console.log(`      -> Comments (reel old): ${count}`);
                    trackStrategy('comments', 'reel_comment_button_old'); // ✅ TAMBAH
                    return count;
                }
            }
        }

        // ========== EXISTING STRATEGIES (keep all) ==========
        const commentSpanSelectors = [
            'span.html-span.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1hl2dhg.x16tdsg8.x1vvkbs.xkrqix3.x1sur9pj',
            'span.html-span.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1hl2dhg.x16tdsg8.x1vvkbs',
            'span.html-span.xdj266r.x14z9mp:has-text("comment")',
            'span.x193iq5w.xeuugli:has-text("comment")',
            'span[class*="xkrqix3"][class*="x1sur9pj"]:has-text("comment")',
            'span[class*="xkrqix3"][class*="x1sur9pj"]'
        ];
        
        for (const selector of commentSpanSelectors) {
            const commentSpans = await postEl.locator(selector).all();
            for (const span of commentSpans) {
                const text = await span.textContent();
                if (text && text.toLowerCase().includes('comment')) {
                    const match = text.match(/(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)\s*comment/i);
                    if (match) {
                        const count = parseEngagementCount(match[1]);
                        if (count > 0) {
                            trackStrategy('comments', 'selector_' + commentSpanSelectors.indexOf(selector)); // ✅ TAMBAH
                            return count;
                        }
                    }
                }
            }
        }

        const commentTexts = await postEl.locator('span, div').allTextContents();
        for (const text of commentTexts) {
            if (!text) continue;
            
            const patterns = [
                /(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)\s*comment/i,
                /comment[s]?[:\s]*(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)/i
            ];
            
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                    const count = parseEngagementCount(match[1]);
                    if (count > 0) {
                        trackStrategy('comments', 'fallback_all_text'); // ✅ TAMBAH
                        return count;
                    }
                }
            }
        }

        const commentButton = postEl.locator('div[role="button"]:has-text("comment")').first();
        if (await commentButton.count() > 0) {
            const text = await commentButton.textContent();
            const match = text.match(/(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)/);
            if (match) {
                const count = parseEngagementCount(match[0]);
                if (count > 0) {
                    trackStrategy('comments', 'comment_button'); // ✅ TAMBAH
                    return count;
                }
            }
        }
        
        if (screenshotOnFail && page && postIndex !== undefined) {
            const timestamp = Date.now();
            const filename = `error_comments_post${postIndex}_${timestamp}.png`;
            await postEl.screenshot({ path: filename }).catch(() => {});
        }
    } catch (e) {
        console.warn(`       ⚠️ Error extract comments: ${e.message.substring(0, 40)}`);
    }
    
    return 0;
}

/**
 * ✅ ENHANCED: Extract Shares with MULTIPLE REEL formats
 */
async function extractShares(postEl, page, postIndex, screenshotOnFail = false) {
    try {
        // ========== STRATEGY 0A: REEL NEW FORMAT (PRIORITY) ==========
        const reelShareNew = postEl.locator('div[aria-label="Share"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6').first();
        if (await reelShareNew.count() > 0) {
            const text = await reelShareNew.textContent();
            if (text && text.match(/\d/)) {
                const count = parseEngagementCount(text);
                if (count > 0) {
                    console.log(`      -> Shares (reel new): ${count}`);
                    trackStrategy('shares', 'reel_share_button_new'); // ✅ TAMBAH
                    return count;
                }
            }
        }
        
        // ========== STRATEGY 0B: REEL OLD FORMAT ==========
        const reelShareOld = postEl.locator('div[aria-label="Share"] span.x1lliihq').first();
        if (await reelShareOld.count() > 0) {
            const text = await reelShareOld.textContent();
            if (text && text.match(/\d/)) {
                const count = parseEngagementCount(text);
                if (count > 0) {
                    console.log(`      -> Shares (reel old): ${count}`);
                    trackStrategy('shares', 'reel_share_button_old'); // ✅ TAMBAH
                    return count;
                }
            }
        }

        // ========== EXISTING STRATEGIES (keep all) ==========
        const shareSpanSelectors = [
            'span.html-span.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1hl2dhg.x16tdsg8.x1vvkbs.xkrqix3.x1sur9pj',
            'span.html-span.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1hl2dhg.x16tdsg8.x1vvkbs',
            'span.html-span.xdj266r.x14z9mp:has-text("share")',
            'span.x193iq5w.xeuugli:has-text("share")',
            'span[class*="xkrqix3"][class*="x1sur9pj"]:has-text("share")',
            'span[class*="xkrqix3"][class*="x1sur9pj"]'
        ];
        
        for (const selector of shareSpanSelectors) {
            const shareSpans = await postEl.locator(selector).all();
            for (const span of shareSpans) {
                const text = await span.textContent();
                if (text && text.toLowerCase().includes('share')) {
                    const match = text.match(/(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)\s*share/i);
                    if (match) {
                        const count = parseEngagementCount(match[1]);
                        if (count > 0) {
                            trackStrategy('shares', 'selector_' + shareSpanSelectors.indexOf(selector)); // ✅ TAMBAH
                            return count;
                        }
                    }
                }
            }
        }

        const shareTexts = await postEl.locator('span, div').allTextContents();
        for (const text of shareTexts) {
            if (!text) continue;
            
            const patterns = [
                /(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)\s*share/i,
                /share[s]?[:\s]*(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)/i
            ];
            
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                    const count = parseEngagementCount(text);
                    if (count > 0) {
                        trackStrategy('shares', 'fallback_all_text'); // ✅ TAMBAH
                        return count;
                    }
                }
            }
        }

        const shareButton = postEl.locator('div[role="button"]:has-text("share")').first();
        if (await shareButton.count() > 0) {
            const text = await shareButton.textContent();
            const match = text.match(/(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)/);
            if (match) {
                const count = parseEngagementCount(match[0]);
                if (count > 0) {
                    trackStrategy('shares', 'share_button'); // ✅ TAMBAH
                    return count;
                }
            }
        }
        
        if (screenshotOnFail && page && postIndex !== undefined) {
            const timestamp = Date.now();
            const filename = `error_shares_post${postIndex}_${timestamp}.png`;
            await postEl.screenshot({ path: filename }).catch(() => {});
        }
    } catch (e) {
        console.warn(`       ⚠️ Error extract shares: ${e.message.substring(0, 40)}`);
    }
    
    return 0;
}


/**
 * ✅ ENHANCED: Quick extract URL dengan support untuk external links
 * Return: { url, timestampLinkEl } atau null
 */
async function quickExtractUrl(postEl) {
    try {
        let postUrl = null;
        let timestampLinkEl = null;
        
        // ========== ✅ NEW STRATEGY 00: attributionsrc links (HIGHEST PRIORITY) ==========
        const attributionLink = await postEl.locator('a[role="link"][attributionsrc]').first();
        if (await attributionLink.count() > 0) {
            const href = await attributionLink.getAttribute('href');
            if (href && (href.includes('/posts/') || href.includes('/photo') || href.includes('/videos/'))) {
                const fullUrl = href.startsWith('http') ? href : new URL(href, 'https://www.facebook.com').href;
                postUrl = cleanPostUrl(fullUrl);
                timestampLinkEl = attributionLink;
                console.log(`         ✅ Strategy 00: Attribution link found`);
                trackStrategy('url', 'attribution_link'); // ✅ TAMBAH
                return { url: postUrl, timestampLinkEl };
            }
        }
        
        // ========== STRATEGY 0: Share links (NEW FORMAT) ==========
        const shareLinks = await postEl.locator('a[href*="/share/v/"], a[href*="/share/p/"], a[href*="/share/r/"]').all();
        for (const link of shareLinks) {
            const href = await link.getAttribute('href');
            if (href && (href.includes('/share/v/') || href.includes('/share/p/') || href.includes('/share/r/'))) {
                const fullUrl = href.startsWith('http') ? href : new URL(href, 'https://www.facebook.com').href;
                postUrl = cleanPostUrl(fullUrl);
                timestampLinkEl = link;
                console.log(`         ✅ Strategy 0: Share link found`);
                trackStrategy('url', 'share_link_v_p_r'); // ✅ TAMBAH
                break;
            }
        }
        
        // ========== STRATEGY 1: Traditional Facebook post links ==========
        if (!postUrl) {
            const linkSelectors = [
                'a[aria-labelledby][href*="__cft__"]',
                'a[href*="__cft__"]:has(span:text-matches("\\d{1,2}\\s+\\w+"))',
                'a[href*="/posts/"], a[href*="/videos/"], a[href*="/photo"], a[href*="/watch/"], a[href*="/reel/"]',
                'div[role="article"] h3 ~ div a[href], div[role="article"] h2 ~ div a[href]'
            ];
            
            for (const selector of linkSelectors) {
                timestampLinkEl = await postEl.locator(selector).first();
                if (await timestampLinkEl.count() > 0) {
                    const href = await timestampLinkEl.getAttribute('href');
                    if (href && (href.includes('/posts/') || href.includes('/videos/') || href.includes('/photo') || href.includes('/watch/') || href.includes('/reel/'))) {
                        postUrl = cleanPostUrl(new URL(href, 'https://www.facebook.com').href);
                        console.log(`         ✅ Strategy 1: Traditional FB link found`);
                        trackStrategy('url', 'traditional_fb_selector_' + linkSelectors.indexOf(selector)); // ✅ TAMBAH
                        break;
                    }
                }
            }
        }
                
        // ========== STRATEGY 2: Alternative Facebook link formats ==========
        if (!postUrl) {
            const altLinkSelectors = [
                'a[href*="/share/v/"]', 'a[href*="/share/p/"]', 'a[href*="/reel/"]',
                'a[href*="/permalink/"]', 'a[href*="story_fbid"]', 'a[href*="/photo.php"]',
                'a[href*="fbid="]', 'a[href^="/watch/"]', 'a[href*="/groups/"][href*="/posts/"]'
            ];
            
            for (const selector of altLinkSelectors) {
                const link = await postEl.locator(selector).first();
                if (await link.count() > 0) {
                    const href = await link.getAttribute('href');
                    if (href) {
                        postUrl = cleanPostUrl(new URL(href, 'https://www.facebook.com').href);
                        timestampLinkEl = link;
                        console.log(`         ✅ Strategy 2: Alternative FB link found`);
                        trackStrategy('url', 'alternative_selector_' + altLinkSelectors.indexOf(selector)); // ✅ TAMBAH
                        break;
                    }
                }
            }
        }

        // ========== STRATEGY 3: External links (NEWS ARTICLES, etc) ==========
        if (!postUrl) {
            console.log(`         -> Strategy 3: Looking for external links...`);
            
            const externalLinkSelectors = [
                // Links with attributionsrc (Facebook tracking untuk external links)
                'a[attributionsrc][target="_blank"]:not([href*="facebook.com"])',
                // Links dengan href langsung ke external domain
                'a[href^="http"]:not([href*="facebook.com"]):not([href*="fbcdn.net"]):not([href*="instagram.com"])[target="_blank"]',
                // Links dalam article preview/card
                'div.x1n2onr6 a[href^="http"]:not([href*="facebook.com"])',
                'div[role="article"] a[href^="http"]:not([href*="facebook.com"])',
                // Broader search for any external link
                'a[href^="https://"]:not([href*="facebook.com"]):not([href*="fbcdn"])',
            ];
            
            for (const selector of externalLinkSelectors) {
                const link = await postEl.locator(selector).first();
                if (await link.count() > 0) {
                    const href = await link.getAttribute('href');
                    
                    // Validate it's a real external URL
                    if (href && 
                        href.startsWith('http') && 
                        !href.includes('facebook.com') && 
                        !href.includes('fbcdn.net') &&
                        !href.includes('fb.com') &&
                        !href.includes('instagram.com')) {
                        
                        // Clean fbclid tracking parameter
                        postUrl = href.split('?fbclid=')[0].split('&fbclid=')[0];
                        timestampLinkEl = link;
                        console.log(`         ✅ Strategy 3: External link found - ${postUrl.substring(0, 70)}...`);
                        trackStrategy('url', 'external_link_selector_' + externalLinkSelectors.indexOf(selector)); // ✅ TAMBAH
                        break;
                    }
                }
            }
        }

        // ========== STRATEGY 4: Super comprehensive search ==========
        if (!postUrl) {
            console.log(`         -> Strategy 4: Comprehensive link search...`);
            const allLinks = await postEl.locator('a[href]').all();
            
            // First pass: Look for Facebook post links
            for (const link of allLinks) {
                const href = await link.getAttribute('href');
                
                if (href && 
                    (href.includes('/share/') || 
                    href.includes('/posts/') || 
                    href.includes('/videos/') || 
                    href.includes('/photo') ||
                    href.includes('/watch/') ||
                    href.includes('/reel/') ||
                    href.includes('story_fbid'))) {
                    
                    const fullUrl = href.startsWith('http') ? href : new URL(href, 'https://www.facebook.com').href;
                    postUrl = cleanPostUrl(fullUrl);
                    timestampLinkEl = link;
                    console.log(`         ✅ Strategy 4a: FB link found - ${postUrl.substring(0, 70)}...`);
                    trackStrategy('url', 'comprehensive_fb_link'); // ✅ TAMBAH
                    break;
                }
            }
            
            // Second pass: If still no URL, look for ANY external links
            if (!postUrl) {
                for (const link of allLinks) {
                    const href = await link.getAttribute('href');
                    
                    if (href && 
                        href.startsWith('http') && 
                        !href.includes('facebook.com') && 
                        !href.includes('fbcdn.net') &&
                        !href.includes('fb.com')) {
                        
                        // Skip URL shorteners
                        const skipDomains = ['bit.ly', 't.co', 'goo.gl', 'ow.ly', 'tinyurl.com'];
                        try {
                            const urlObj = new URL(href);
                            const domain = urlObj.hostname.replace('www.', '');
                            
                            if (!skipDomains.some(skip => domain.includes(skip))) {
                                postUrl = href.split('?fbclid=')[0].split('&fbclid=')[0];
                                timestampLinkEl = link;
                                console.log(`         ✅ Strategy 4b: External link found - ${postUrl.substring(0, 70)}...`);
                                trackStrategy('url', 'comprehensive_external_link'); // ✅ TAMBAH
                                break;
                            }
                        } catch (urlError) {
                            continue;
                        }
                    }
                }
            }
        }
        
        // ========== VALIDATION ==========
        if (!postUrl || postUrl === '#' || postUrl.includes('undefined')) {
            console.log(`         ❌ All strategies failed - no valid URL found`);
            return null;
        }
        
        return { url: postUrl, timestampLinkEl };
        
    } catch (e) {
        console.warn(`         ⚠️ quickExtractUrl error: ${e.message.substring(0, 50)}`);
        return null;
    }
}


/**
 * ✅ ENHANCED: Extract Timestamp with BETTER link detection
 */
async function extractTimestamp(postEl, timestampLinkEl, page) {
    try {
        console.log(`         -> Starting ENHANCED timestamp extraction...`);
        
        // ========== ✅ NEW STRATEGY 0: Find better timestamp link first ==========
        let linkToHover = timestampLinkEl;
        
        // Try to find link with aria-labelledby (new Facebook format)
        const betterLinkSelectors = [
            'a[role="link"][attributionsrc]', // Link dengan attributionsrc
            'span[aria-labelledby] a[role="link"]', // Link dalam span dengan aria-labelledby
            'a[href*="/posts/"][role="link"]',
            'a[href*="/photo"][role="link"]',
            'a[href*="/videos/"][role="link"]',
        ];
        
        for (const selector of betterLinkSelectors) {
            const link = await postEl.locator(selector).first();
            if (await link.count() > 0) {
                linkToHover = link;
                console.log(`         -> Found better timestamp link with: ${selector.substring(0, 40)}...`);
                break;
            }
        }
        
        // ========== STRATEGY A: HOVER KE LINK ==========
        console.log(`         -> Strategy A: Hover to timestamp link`);
        
        try {
            await linkToHover.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
            await linkToHover.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(800);
            
            // Get bounding box untuk precise hover
            const box = await linkToHover.boundingBox().catch(() => null);
            if (box) {
                const x = box.x + box.width / 2;
                const y = box.y + box.height / 2;
                await page.mouse.move(x, y, { steps: 5 });
                console.log(`         -> Mouse moved to link position (${Math.round(x)}, ${Math.round(y)})`);
            } else {
                await linkToHover.hover({ timeout: 5000 }).catch(() => {});
            }
            
            await page.waitForTimeout(3500); // Wait longer for tooltip
            
        } catch (hoverError) {
            console.log(`         -> Hover failed: ${hoverError.message.substring(0, 30)}`);
        }
        
        // ✅ Check for tooltip with EXACT selector dari HTML Anda
        const tooltipSelector = 'div[role="tooltip"] span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.x1xmvt09.x1nxh6w3.x1sibtaa.xo1l8bm.xzsf02u';
        const tooltip = page.locator(tooltipSelector).first();
        
        if (await tooltip.count() > 0) {
            const tooltipText = await tooltip.textContent();
            if (tooltipText && tooltipText.match(/\d{4}/) && tooltipText.length > 10) {
                console.log(`         ✅ Strategy A1 SUCCESS: ${tooltipText}`);
                await page.mouse.move(0, 0).catch(() => {});
                trackStrategy('timestamp', 'tooltip_exact_selector'); // ✅ TAMBAH
                return cleanTextForCSV(tooltipText);
            }
        }
        
        // Fallback: any tooltip
        const anyTooltip = page.locator('div[role="tooltip"]:visible').first();
        if (await anyTooltip.count() > 0) {
            const text = await anyTooltip.textContent();
            if (text && text.match(/\d{4}/) && text.length > 10) {
                console.log(`         ✅ Strategy A2 SUCCESS: ${text}`);
                await page.mouse.move(0, 0).catch(() => {});
                trackStrategy('timestamp', 'tooltip_any_visible'); // ✅ TAMBAH
                return cleanTextForCSV(text);
            }
        }
        
        await page.mouse.move(0, 0).catch(() => {});
        console.log(`         -> Strategy A: All methods failed`);
        
        // ========== STRATEGY B: aria-labelledby lookup ==========
        console.log(`         -> Strategy B: Check aria-labelledby`);
        
        try {
            const spanWithAria = await postEl.locator('span[aria-labelledby]').first();
            if (await spanWithAria.count() > 0) {
                const ariaId = await spanWithAria.getAttribute('aria-labelledby');
                if (ariaId) {
                    // Try to find element with this ID
                    const labelEl = page.locator(`[id="${ariaId}"]`).first();
                    if (await labelEl.count() > 0) {
                        const labelText = await labelEl.textContent();
                        if (labelText && labelText.match(/\d{4}/)) {
                            console.log(`         ✅ Strategy B SUCCESS: ${labelText}`);
                            trackStrategy('timestamp', 'aria_labelledby'); // ✅ TAMBAH
                            return cleanTextForCSV(labelText);
                        }
                    }
                }
            }
        } catch (e) {
            console.log(`         -> Strategy B failed: ${e.message.substring(0, 30)}`);
        }
        
        // ========== STRATEGY C: HOVER TO OTHER DATE-LIKE ELEMENTS ==========
        console.log(`         -> Strategy C: Hover to date-like elements`);
        
        const datePatterns = [
            'span:text-matches("\\d+ (minute|hour|day|week|month|year)")',
            'span:text-matches("(Mon|Tue|Wed|Thu|Fri|Sat|Sun)")',
            'a[role="link"]:has(span[style*="display: flex"])', // Obfuscated text pattern
        ];
        
        for (const pattern of datePatterns) {
            try {
                const dateEl = postEl.locator(pattern).first();
                if (await dateEl.count() > 0) {
                    await dateEl.scrollIntoViewIfNeeded().catch(() => {});
                    await page.waitForTimeout(500);
                    
                    const box = await dateEl.boundingBox().catch(() => null);
                    if (box) {
                        const x = box.x + box.width / 2;
                        const y = box.y + box.height / 2;
                        await page.mouse.move(x, y, { steps: 5 });
                        await page.waitForTimeout(3000);
                        
                        const tooltip = page.locator(tooltipSelector).first();
                        if (await tooltip.count() > 0) {
                            const text = await tooltip.textContent();
                            if (text && text.match(/\d{4}/)) {
                                console.log(`         ✅ Strategy C SUCCESS: ${text}`);
                                await page.mouse.move(0, 0).catch(() => {});
                                trackStrategy('timestamp', 'hover_date_element_' + datePatterns.indexOf(pattern)); // ✅ TAMBAH
                                return cleanTextForCSV(text);
                            }
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        await page.mouse.move(0, 0).catch(() => {});
        console.log(`         -> Strategy C: Failed`);
        
        // ========== STRATEGY D: DOM TEXT SEARCH (Enhanced patterns) ==========
        console.log(`         -> Strategy D: DOM text search`);
        
        const datePatterns2 = [
            // Full format: "Thursday 23 October 2025 at 16:07"
            /(\w+\s+\d{1,2}\s+\w+\s+\d{4}\s+at\s+\d{1,2}:\d{2})/i,
            // Without day: "23 October 2025 at 16:07"
            /(\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\s+at\s+\d{1,2}:\d{2})/i,
            // Short format: "Oct 23, 2025 at 4:07 PM"
            /(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\s+at\s+\d{1,2}:\d{2})/i,
            // Just date: "23 October 2025"
            /(\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i,
        ];
        
        const allTexts = await postEl.locator('span, div, time, abbr').allTextContents();
        
        for (const text of allTexts) {
            for (const pattern of datePatterns2) {
                const match = text.match(pattern);
                if (match) {
                    console.log(`         ✅ Strategy D SUCCESS: ${match[0]}`);
                    trackStrategy('timestamp', 'dom_text_pattern_' + datePatterns2.indexOf(pattern)); // ✅ TAMBAH
                    return cleanTextForCSV(match[0]);
                }
            }
        }
        
        console.log(`         -> Strategy D: Failed`);
        
        // ========== STRATEGY E: TIME ELEMENT ==========
        console.log(`         -> Strategy E: Time element`);
        
        const timeEl = postEl.locator('time, abbr[data-utime]').first();
        if (await timeEl.count() > 0) {
            const datetime = await timeEl.getAttribute('datetime') || await timeEl.textContent();
            if (datetime && datetime.match(/\d{4}/)) {
                console.log(`         ✅ Strategy E SUCCESS: ${datetime}`);
                trackStrategy('timestamp', 'time_element'); // ✅ TAMBAH
                return cleanTextForCSV(datetime);
            }
        }
        
        console.log(`         -> Strategy E: Failed`);
        console.log(`         ❌ ALL STRATEGIES FAILED`);
        return "N/A";
        
    } catch (e) {
        console.warn(`         ⚠️ Error: ${e.message.substring(0, 60)}`);
        return "N/A";
    }
}

/**
 * ✅ FIXED: Extract Share URL - PROTECTED CLIPBOARD
 * Keep existing Share button mechanism but protect from user clipboard interference
 */
async function extractShareUrl(page, postEl) {
    let shareUrl = "N/A";
    let originalClipboard = null;
    
    try {
        // ========== STEP 0: Save original clipboard ==========
        try {
            originalClipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
            if (originalClipboard) {
                console.log(`         ℹ️  Original clipboard saved (will be restored)`);
            }
        } catch (e) {
            console.log(`         -> Cannot access clipboard initially`);
        }
        
        // ========== STEP 1: Find Share button ==========
        const shareButtonSelectors = [
            // ✅ Priority: Exact match dari HTML yang diberikan user
            'div[aria-label="Send this to friends or post it on your profile."][role="button"]',
            'div[role="button"]:has(span[data-ad-rendering-role="share_button"])',
            'div.x1i10hfl[role="button"]:has(span[data-ad-rendering-role="share_button"])',
            // Fallback
            'div[aria-label*="Send this"][role="button"]',
            'div[role="button"]:has-text("Share")',
            'div.x9f619:has(span:text-is("Share"))',
        ];
        
        let shareButton = null;
        
        for (const selector of shareButtonSelectors) {
            const btn = postEl.locator(selector).first();
            if (await btn.count() > 0) {
                shareButton = btn;
                console.log(`         -> Found Share button`);
                break;
            }
        }
        
        if (!shareButton) {
            console.log(`         -> Share button not found`);
            return "N/A";
        }
        
        await shareButton.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(500);
        
        // ========== STEP 2: Click Share button with retry ==========
        let clickSuccess = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await shareButton.click({ timeout: 5000 });
                console.log(`         -> Share button clicked`);
                clickSuccess = true;
                break;
            } catch (e) {
                if (attempt < 3) {
                    await page.waitForTimeout(1000);
                }
            }
        }
        
        if (!clickSuccess) {
            console.log(`         -> Failed to click Share button`);
            return "N/A";
        }
        
        await page.waitForTimeout(2500);
        
        // ========== STEP 3: Find Copy link button ==========
        console.log(`         -> Looking for Copy link button...`);
        
        const copyLinkSelectors = [
            // ✅ Priority: Exact match dari HTML yang diberikan user
            'div.x1i10hfl[role="button"]:has(span:has-text("Copy link"))',
            'div[role="button"]:has(span.x1lliihq:has-text("Copy link"))',
            'div.x1i10hfl.x1qjc9v5[role="button"]:has(span:text-matches("Copy link", "i"))',
            // Medium priority
            'div.x1n2onr6.x1ja2u2z:has(span:text-is("Copy link"))',
            'div[role="menuitem"]:has(span:text-is("Copy link"))',
            // Fallback
            'span:text-is("Copy link")',
            'div:has-text("Copy link")',
        ];
        
        let copyLinkButton = null;
        let usedSelector = null;
        
        for (const selector of copyLinkSelectors) {
            try {
                const btn = page.locator(selector).first();
                await btn.waitFor({ state: 'visible', timeout: 3000 });
                
                if (await btn.count() > 0) {
                    copyLinkButton = btn;
                    usedSelector = selector;
                    console.log(`         ✓ Found with: ${selector.substring(0, 50)}...`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!copyLinkButton) {
            console.log(`         -> Copy link button not found`);
            
            // ✅ DEBUG: Save screenshot of menu
            if (CONFIG.DEBUG_MODE) {
                await page.screenshot({ path: `debug_share_menu_${Date.now()}.png` }).catch(() => {});
                console.log(`         📸 Share menu screenshot saved`);
            }
            
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            return "N/A";
        }
        
        // ========== STEP 4: Clear clipboard before click ==========
        try {
            await page.evaluate(() => navigator.clipboard.writeText(''));
            console.log(`         -> Clipboard cleared before copy`);
        } catch (e) {
            console.log(`         -> Cannot clear clipboard`);
        }
        
        await page.waitForTimeout(300);
        
        // ========== STEP 5: Click Copy link with retry ==========
        let copyClickSuccess = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await copyLinkButton.click({ timeout: 3000 });
                console.log(`         -> Copy link clicked`);
                copyClickSuccess = true;
                break;
            } catch (e) {
                if (attempt === 2) {
                    try {
                        await copyLinkButton.click({ force: true, timeout: 3000 });
                        copyClickSuccess = true;
                        break;
                    } catch (e2) {}
                }
                if (attempt < 3) {
                    await page.waitForTimeout(1000);
                }
            }
        }
        
        if (!copyClickSuccess) {
            console.log(`         -> Failed to click Copy link`);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
            return "N/A";
        }
        
        // ========== STEP 6: Read clipboard IMMEDIATELY with multiple attempts ==========
        let clipboardAttempts = 0;
        const maxClipboardAttempts = 5;
        
        while (clipboardAttempts < maxClipboardAttempts) {
            await page.waitForTimeout(400); // Wait for Facebook to write
            
            try {
                const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
                
                // Validate it's a Facebook URL
                if (clipboardContent && 
                    (clipboardContent.includes('facebook.com') || 
                     clipboardContent.includes('fb.watch') || 
                     clipboardContent.includes('fb.me'))) {
                    shareUrl = clipboardContent;
                    console.log(`         ✅ Got Facebook URL from clipboard (attempt ${clipboardAttempts + 1})`);
                    trackStrategy('shareUrl', 'clipboard_copy_link_button'); // ✅ TAMBAH
                    break;
                } else {
                    console.log(`         -> Attempt ${clipboardAttempts + 1}: Not Facebook URL, retrying...`);
                    clipboardAttempts++;
                }
            } catch (e) {
                console.log(`         -> Attempt ${clipboardAttempts + 1}: Clipboard read error, retrying...`);
                clipboardAttempts++;
            }
        }
        
        if (shareUrl === "N/A") {
            console.log(`         ⚠️ Failed to get Facebook URL after ${maxClipboardAttempts} attempts`);
        }
        
        // ========== STEP 7: Close dialog ==========
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        
        return shareUrl;
        
    } catch (shareError) {
        console.warn(`         ⚠️ Error extract share URL: ${shareError.message.substring(0, 50)}`);
        
        try {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        } catch (e) {}
        
        return "N/A";
        
    } finally {
        // ========== STEP 8: ALWAYS restore original clipboard ==========
        if (originalClipboard !== null) {
            try {
                await page.evaluate((text) => navigator.clipboard.writeText(text), originalClipboard);
                console.log(`         ✅ Original clipboard restored`);
            } catch (e) {
                console.log(`         -> Cannot restore clipboard`);
            }
        }
    }
}


/**
 * ✅ NEW: Handle translated posts - Click "See original" & "See more"
 */
async function handleTranslatedContent(page, postEl) {
    try {
        // ========== STEP 1: Check if "See original" button exists ==========
        const seeOriginalSelectors = [
            'div[role="button"]:has-text("See original")',
            'div[role="button"]:has-text("Lihat asli")',
            'div.xkrqix3.x1sur9pj:has-text("See original")',
        ];
        
        let seeOriginalButton = null;
        for (const selector of seeOriginalSelectors) {
            const btn = postEl.locator(selector).first();
            if (await btn.count() > 0) {
                seeOriginalButton = btn;
                console.log(`      -> Found "See original" button`);
                break;
            }
        }
        
        // If no translation detected, return false (continue normal extraction)
        if (!seeOriginalButton) {
            return false;
        }
        
        // ========== STEP 2: Click "See original" ==========
        try {
            await seeOriginalButton.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(500);
            await seeOriginalButton.click({ timeout: 5000 });
            console.log(`      -> Clicked "See original"`);
            
            // Wait for content to change
            await page.waitForTimeout(3000);
        } catch (e) {
            console.log(`      -> Could not click "See original": ${e.message.substring(0, 30)}`);
            return false;
        }
        
        // ========== STEP 3: Check if "See more" appears (truncated Indonesian text) ==========
        const seeMoreSelectors = [
            'div[role="button"]:has-text("See more")',
            'div[role="button"]:has-text("Lihat selengkapnya")',
            'div.xkrqix3.x1sur9pj.xzsf02u:has-text("See more")',
        ];
        
        let seeMoreButton = null;
        for (const selector of seeMoreSelectors) {
            const btn = postEl.locator(selector).first();
            if (await btn.count() > 0) {
                seeMoreButton = btn;
                console.log(`      -> Found "See more" button`);
                break;
            }
        }
        
        // ========== STEP 4: Click "See more" if exists ==========
        if (seeMoreButton) {
            try {
                await seeMoreButton.scrollIntoViewIfNeeded().catch(() => {});
                await page.waitForTimeout(500);
                await seeMoreButton.click({ timeout: 5000 });
                console.log(`      -> Clicked "See more"`);
                
                // Wait for full content to load
                await page.waitForTimeout(2000);
            } catch (e) {
                console.log(`      -> Could not click "See more": ${e.message.substring(0, 30)}`);
            }
        }
        
        return true; // Translation handled successfully
        
    } catch (error) {
        console.warn(`      ⚠️ Error handling translation: ${error.message.substring(0, 40)}`);
        return false;
    }
}


/**
 * ✅ OPTIMIZED: Scrape Facebook Search with Quick Duplicate Check
 */
async function scrapeFacebookSearch(page, query, maxPosts, filterYear = null) {
    const yearLabel = filterYear ? ` (Year: ${filterYear})` : ' (Recent Posts Mode)';
    console.log(`🔍 Memulai pencarian: "${query}"${yearLabel} (Target: ${maxPosts} posts)`);

    // ✅ HYBRID MODE: Setup GraphQL interceptor if enabled
    if (CONFIG.USE_HYBRID_MODE) {
        console.log(`   🔄 Hybrid Mode: Enabled (GraphQL API + HTML Scraping)`);
        await setupGraphQLInterceptor(page);
    }

    let postsData = [];
    let scrollTanpaHasil = 0;

    const skipReasons = {
        alreadyScraped: 0,
        noValidLink: 0,
        invalidTimestamp: 0,
        invalidUrl: 0,
        detachedElement: 0,
        profileCard: 0,      // ✅ NEW
        peopleCard: 0,       // ✅ NEW
        suggestedCard: 0,    // ✅ NEW
        sponsored: 0,        // ✅ NEW
        groupPromo: 0,       // ✅ NEW
        eventCard: 0,        // ✅ NEW
        marketplace: 0,      // ✅ NEW
        emptyContent: 0,     // ✅ NEW
        otherErrors: 0
    };
    
    try {
        if (filterYear && CONFIG.USE_DATE_FILTER && typeof filterYear === 'number') {
            const filterApplied = await applyDateFilter(page, filterYear);
            if (filterApplied) {
                await page.waitForTimeout(3000);
                console.log(`   > Filter year ${filterYear} active`);
            } else {
                console.log(`   > Proceeding without year filter`);
            }
        } else if (filterYear === null) {
            console.log(`   > ✅ Recent Posts mode active (no date filter needed)`);
        }

        const postSelector = 'div[role="feed"] > div';
        await page.waitForSelector(postSelector, { timeout: 30000 });
        console.log("   > Feed postingan ditemukan. Memulai ekstraksi data...");

        // ✅ Track URLs di scroll cycle untuk detect stuck feed
        let currentScrollUrls = new Set();
        let samePostsCount = 0;

        while (postsData.length < maxPosts) {
            const posts = await page.locator(postSelector).all();
            let newPostsInLoop = 0;
            const scrollCycleUrls = new Set();

            for (let i = 0; i < posts.length; i++) {
                const postEl = posts[i];
                

        // ========== ✅ SKIP NON-POST ELEMENTS - ENHANCED ==========
        try {
            const isAttached = await postEl.evaluate(el => el.isConnected).catch(() => false);
            
            if (!isAttached) {
                skipReasons.detachedElement++;
                continue;
            }
            
            // SKIP: Profile/Page cards
            const isProfileCard = await postEl.locator('div[role="button"]:has-text("Follow"), div[role="button"]:has-text("Following")').count() > 0;
            const hasFollowerCount = await postEl.locator('span:has-text("followers"), span:has-text("follower")').count() > 0;
            const isPageInfo = await postEl.locator('div:has-text("posts in the last")').count() > 0;
            const hasStoryRing = await postEl.locator('svg[aria-label*="Has unviewed story"]').count() > 0;
            
            if ((isProfileCard || hasFollowerCount) && (isPageInfo || hasStoryRing)) {
                console.log(`   ⏭️  Post #${i + 1}: Skipped (profile/page suggestion card)`);
                skipReasons.profileCard++;
                continue;
            }
            
            // SKIP: "People you may know" cards
            const isPeopleCard = await postEl.locator('h2:has-text("People you may know"), h3:has-text("People you may know")').count() > 0;
            if (isPeopleCard) {
                console.log(`   ⏭️  Post #${i + 1}: Skipped (people suggestion card)`);
                skipReasons.peopleCard++;
                continue;
            }
            
            // SKIP: "Suggested for you" cards
            const isSuggestedCard = await postEl.locator('span:has-text("Suggested for you")').count() > 0;
            if (isSuggestedCard) {
                console.log(`   ⏭️  Post #${i + 1}: Skipped (suggested content card)`);
                skipReasons.suggestedCard++;
                continue;
            }
            
            // SKIP: Sponsored/Ads posts
            const isSponsoredPost = await postEl.locator(
                'span:has-text("Sponsored"), ' +
                'a[aria-label="Sponsored"], ' +
                'div[aria-label="Sponsored"]'
            ).count() > 0;
            
            if (isSponsoredPost) {
                console.log(`   ⏭️  Post #${i + 1}: Skipped (sponsored/ads post)`);
                skipReasons.sponsored++;
                continue;
            }
            
            // SKIP: Group join promotion
            const isGroupPromo = await postEl.locator(
                'span:has-text("Public group"), ' +
                'span:has-text("members"), ' +
                'div[data-ad-rendering-role="meta"]:has-text("facebook.com")'
            ).count() >= 2;
            
            const hasGroupJoinButton = await postEl.locator(
                'a:has-text("Join"), ' +
                'div[role="button"]:has-text("Join group")'
            ).count() > 0;
            
            if (isGroupPromo && hasGroupJoinButton) {
                console.log(`   ⏭️  Post #${i + 1}: Skipped (group join promotion)`);
                skipReasons.groupPromo++;
                continue;
            }
            
            // SKIP: Event cards
            const isEventCard = await postEl.locator(
                'a[href*="/events/"], ' +
                'span:has-text("Interested"), ' +
                'span:has-text("Going")'
            ).count() >= 2;
            
            if (isEventCard) {
                console.log(`   ⏭️  Post #${i + 1}: Skipped (event card)`);
                skipReasons.eventCard++;
                continue;
            }
            
            // SKIP: Marketplace listings
            const isMarketplaceListing = await postEl.locator(
                'a[href*="/marketplace/"], ' +
                'span:has-text("Listed"), ' +
                'span:has-text("for sale")'
            ).count() >= 2;
            
            if (isMarketplaceListing) {
                console.log(`   ⏭️  Post #${i + 1}: Skipped (marketplace listing)`);
                skipReasons.marketplace++;
                continue;
            }
            
            // SKIP: Empty/placeholder elements
            const hasAnyContent = await postEl.locator(
                'img[src*="scontent"], ' +
                'video, ' +
                'div[data-ad-preview="message"], ' +
                'span[dir="auto"]'
            ).count() > 0;
            
            if (!hasAnyContent) {
                console.log(`   ⏭️  Post #${i + 1}: Skipped (empty/placeholder element)`);
                skipReasons.emptyContent++;
                continue;
            }
            
            // ✅ Scroll to element (lanjut proses normal)
            await postEl.scrollIntoViewIfNeeded({ behavior: 'smooth' }).catch(() => {});
            await page.waitForTimeout(500);

            // ✅ VISUAL HIGHLIGHT: Mark post as being processed
            await highlightPost(page, postEl, 'start');

        } catch (checkError) {
            console.warn(`      ⚠️ Error checking element: ${checkError.message.substring(0, 50)}`);
            skipReasons.otherErrors++;
            continue;
        }


                // ========== ✅ QUICK URL CHECK FIRST ==========
                const quickResult = await quickExtractUrl(postEl);

                if (!quickResult) {
                    console.log(`   ⏭️  Post #${i + 1}: No valid link found after all strategies`);
                    
                    // DEBUG: Save HTML untuk analisis
                    if (CONFIG.DEBUG_MODE) {
                        const postHtml = await postEl.innerHTML().catch(() => 'Could not get HTML');
                        const filename = `debug_post_nolink_${i + 1}_${Date.now()}.html`;
                        fs.writeFileSync(filename, postHtml);
                        console.log(`         📝 Debug HTML saved: ${filename}`);
                    }
                    
                    skipReasons.noValidLink++;
                    continue;
                }

                console.log(`   📍 Post #${i + 1} URL: ${quickResult.url.substring(0, 80)}...`);

                const postUrl = quickResult.url;
                scrollCycleUrls.add(postUrl);

                // ========== ✅ LEVEL 1: URL EXACT MATCH ==========
                if (allScrapedUrls.has(postUrl)) {
                    const dupInfo = findDuplicateInCSV('post_url', postUrl);
                    
                    console.log(`   ⏭️  Post #${i + 1}: 🔄 DUPLICATE URL`);
                    
                    if (dupInfo.found) {
                        console.log(`      📁 ${path.basename(dupInfo.file)} Line:${dupInfo.lineNumber} Author:${dupInfo.author.substring(0,20)}`);
                    }
                    // ✅ Tidak perlu else block lagi, karena kalau ada di allScrapedUrls 
                    //    pasti sudah di CSV (loaded dari CSV di awal)
                    
                    skipReasons.alreadyScraped++;
                    continue;
                }

                // ========== ✅ LEVEL 2: POST ID MATCH ==========
                const postId = extractPostId(postUrl);
                if (postId) {
                    const postIdKey = `postid:${postId}`;
                    if (allScrapedUrls.has(postIdKey)) {
                        const dupInfo = findDuplicateInCSV('post_url', postId);
                        
                        console.log(`   ⏭️  Post #${i + 1}: 🔄 DUPLICATE POST ID (${postId.substring(0,15)})`);
                        if (dupInfo.found) {
                            console.log(`      📁 ${path.basename(dupInfo.file)} Line:${dupInfo.lineNumber} | Different URL format`);
                        }
                        
                        skipReasons.alreadyScraped++;
                        continue;
                    }
                }

                // ========== ✅ LEVEL 3: QUICK PREVIEW EXTRACTION untuk Image & Content ==========
                let previewImageUrl = "N/A";
                let previewAuthor = "N/A";
                let previewContent = "";

                try {
                    // Quick image check
                    const imgEl = await postEl.locator('img[src*="scontent"][src*=".jpg"]').first();
                    if (await imgEl.count() > 0) {
                        previewImageUrl = await imgEl.getAttribute('src');
                    }
                    
                    // Quick author check
                    const authorEl = await postEl.locator('h3 a, h2 a strong, h4 a strong').first();
                    if (await authorEl.count() > 0) {
                        previewAuthor = cleanTextForCSV(await authorEl.innerText());
                    }
                    
                    // Quick content check
                    const contentEl = await postEl.locator('div[data-ad-preview="message"] span[dir="auto"]').first();
                    if (await contentEl.count() > 0) {
                        previewContent = cleanTextForCSV(await contentEl.textContent() || '');
                    }
                } catch (e) {
                    // Jika preview gagal, lanjutkan ke full extraction
                }

                // ========== ✅ LEVEL 4: IMAGE PHOTO ID MATCH ==========
                if (previewImageUrl !== "N/A") {
                    const photoId = extractPhotoIdFromImageUrl(previewImageUrl);
                    if (photoId) {
                        const photoIdKey = `photoid:${photoId}`;
                        if (allScrapedUrls.has(photoIdKey)) {
                            const dupInfo = findDuplicateInCSV('image_source', photoId);
                            
                            console.log(`   ⏭️  Post #${i + 1}: 🔄 DUPLICATE PHOTO ID (${photoId})`);
                            if (dupInfo.found) {
                                console.log(`      📁 ${path.basename(dupInfo.file)} Line:${dupInfo.lineNumber} | Same image`);
                            }
                            
                            skipReasons.alreadyScraped++;
                            continue;
                        }
                    }
                }

                // ========== ✅ LEVEL 5: CONTENT FINGERPRINT (jika ada preview content & author) ==========
                if (previewAuthor !== "N/A" && previewContent) {
                    const timestampPreview = await postEl.locator('span:text-matches("\\\\d{1,2}\\\\s+\\\\w+")').first().textContent().catch(() => "N/A");
                    const contentHash = generateContentFingerprint(previewAuthor, timestampPreview, previewContent, previewImageUrl);
                    const hashKey = `hash:${contentHash}`;
                    
                    if (allScrapedUrls.has(hashKey)) {
                        const dupInfo = findDuplicateInCSV('content_text', previewContent.substring(0, 50));
                        
                        console.log(`   ⏭️  Post #${i + 1}: 🔄 DUPLICATE CONTENT`);
                        if (dupInfo.found) {
                            console.log(`      📁 ${path.basename(dupInfo.file)} Line:${dupInfo.lineNumber} | Same content`);
                        }
                        
                        skipReasons.alreadyScraped++;
                        continue;
                    }
                }

                // ✅ NEW: Check rate limit before extraction
                await checkRateLimit();
                
                // ========== START FULL EXTRACTION ==========
                console.log(`\n   🔎 Extracting post #${i + 1}...`);
                console.log(`      -> Post URL: ${postUrl}`);

                try {
                    let authorName = "N/A";
                    let postTimestamp = "N/A";
                    let shareUrl = "N/A";
                    let contentText = "";
                    let imageUrl = "N/A";
                    let videoUrl = "N/A";
                    let actualImageUrl = "N/A";
                    let actualVideoUrl = "N/A";
                    
                    const timestampLinkEl = quickResult.timestampLinkEl;

                    // ========== EXTRACT TIMESTAMP ==========
                    if (timestampLinkEl) {
                        postTimestamp = await extractTimestamp(postEl, timestampLinkEl, page);
                        console.log(`      -> Timestamp: ${postTimestamp}`);
                        
                        if (CONFIG.DEBUG_MODE) {
                            await debugPause(`Post #${i + 1} Timestamp: ${postTimestamp}`);
                        }
                        
                        if (!isValidTimestamp(postTimestamp)) {
                            skipReasons.invalidTimestamp++;
                            console.log(`      -> SKIP [TIMESTAMP]: Post before cutoff (${postTimestamp})`);
                            continue;
                        }
                    }

                    // ========== EXTRACT AUTHOR (SUPPORT MULTIPLE AUTHORS + REEL + OTHERS) ==========
                    let authorUrl = "N/A"; // ✅ NEW: Track author profile URL from DOM

                    try {
                        // ✅ Strategy 0: REEL author (h2 with specific class)
                        const reelAuthorEl = postEl.locator('h2.html-h2 a[aria-label*="See owner profile"]').first();
                        if (await reelAuthorEl.count() > 0) {
                            const text = await reelAuthorEl.textContent();
                            const href = await reelAuthorEl.getAttribute('href');
                            if (text && text.trim()) {
                                authorName = cleanTextForCSV(text.trim());
                                // ✅ Extract author URL from href
                                if (href) {
                                    authorUrl = normalizeFacebookUrl(href);
                                }
                                console.log(`      -> Author (reel): ${authorName}`);
                                trackStrategy('author', 'reel_h2_profile_link'); // ✅ TAMBAH
                            }
                        }
                        
                        // ✅ Strategy 0b: Try profile.php link for reel
                        if (authorName === "N/A") {
                            const reelAuthorAlt = postEl.locator('h2 a[href*="/profile.php"]').first();
                            if (await reelAuthorAlt.count() > 0) {
                                const text = await reelAuthorAlt.textContent();
                                const href = await reelAuthorAlt.getAttribute('href');
                                if (text && text.trim()) {
                                    authorName = cleanTextForCSV(text.trim());
                                    // ✅ Extract author URL from href
                                    if (href) {
                                        authorUrl = normalizeFacebookUrl(href);
                                    }
                                    console.log(`      -> Author (reel profile): ${authorName}`);
                                    trackStrategy('author', 'reel_profile_php'); // ✅ TAMBAH
                                }
                            }
                        }
                        
                        // ✅ Strategy 1a: Pattern "X is with Y at Location"
                        if (authorName === "N/A") {
                            const withContainer = postEl.locator('h3:has-text(" is with "), h2:has-text(" is with ")').first();

                            if (await withContainer.count() > 0) {
                                // Get all bold author links (exclude location link)
                                const authorLinks = await withContainer.locator('b a[role="link"]').all();
                                const authorNames = [];
                                let firstAuthorUrl = null; // ✅ NEW: Track first author URL

                                for (const link of authorLinks) {
                                    const href = await link.getAttribute('href');
                                    // Skip if it's a page/location link
                                    if (href && !href.includes('/pages/') && !href.includes('Kota-') && !href.includes('Kabupaten-') && !href.match(/Indonesia-\d+/)) {
                                        const name = await link.innerText().catch(() => '');
                                        if (name && name.trim()) {
                                            authorNames.push(cleanTextForCSV(name.trim()));
                                            // ✅ Save first author's URL
                                            if (!firstAuthorUrl) {
                                                firstAuthorUrl = href;
                                            }
                                        }
                                    }
                                }
                                
                                // ✅ NEW: Check for "X others" button and extract hidden authors
                                const othersButton = withContainer.locator('div[role="button"]:has-text("others"), b:has-text("others")').first();
                                
                                if (await othersButton.count() > 0) {
                                    console.log(`         -> Found "X others" button, hovering to reveal names...`);
                                    
                                    try {
                                        // Hover to reveal tooltip
                                        await othersButton.scrollIntoViewIfNeeded().catch(() => {});
                                        await page.waitForTimeout(500);
                                        await othersButton.hover({ timeout: 3000 });
                                        await page.waitForTimeout(2000);
                                        
                                        // Wait for tooltip to appear
                                        const tooltip = page.locator('div[role="tooltip"]:visible, span.x193iq5w.xeuugli:visible').first();
                                        
                                        if (await tooltip.count() > 0) {
                                            // Extract all names from tooltip
                                            const tooltipText = await tooltip.textContent();
                                            
                                            if (tooltipText) {
                                                // Split by comma and line breaks, clean each name
                                                const hiddenAuthors = tooltipText
                                                    .split(/,|\n|<br>/)
                                                    .map(name => name.trim())
                                                    .filter(name => name && name.length > 0 && !name.match(/^\s*$/))
                                                    .map(name => cleanTextForCSV(name));
                                                
                                                if (hiddenAuthors.length > 0) {
                                                    console.log(`         ✅ Extracted ${hiddenAuthors.length} hidden authors from tooltip`);
                                                    authorNames.push(...hiddenAuthors);
                                                }
                                            }
                                        }
                                        
                                        // Move mouse away to close tooltip
                                        await page.mouse.move(0, 0).catch(() => {});
                                        
                                    } catch (tooltipError) {
                                        console.log(`         ⚠️ Could not extract tooltip: ${tooltipError.message.substring(0, 40)}`);
                                    }
                                }
                                
                                if (authorNames.length > 0) {
                                    authorName = authorNames.join(' with ');
                                    // ✅ Set author URL from first author
                                    if (firstAuthorUrl) {
                                        authorUrl = normalizeFacebookUrl(firstAuthorUrl);
                                    }
                                    console.log(`      -> Authors (is with): ${authorName} (${authorNames.length} authors)`);
                                    trackStrategy('author', 'is_with_pattern'); // ✅ TAMBAH
                                }
                            }
                        }
                        
                        // ✅ Strategy 1b: Pattern "X is in Location"
                        if (authorName === "N/A") {
                            const inContainer = postEl.locator('span:has-text(" is in "), h3:has-text(" is in ")').first();

                            if (await inContainer.count() > 0) {
                                // Get ONLY the FIRST bold author link (before "is in")
                                const firstAuthorLink = await inContainer.locator('b a[role="link"]').first();

                                if (await firstAuthorLink.count() > 0) {
                                    const href = await firstAuthorLink.getAttribute('href');
                                    // Make sure it's not a location link
                                    if (href && !href.includes('/pages/') && !href.includes('Kota-') && !href.includes('Kabupaten-') && !href.match(/Indonesia-\d+/)) {
                                        const name = await firstAuthorLink.innerText().catch(() => '');
                                        if (name && name.trim()) {
                                            authorName = cleanTextForCSV(name.trim());
                                            // ✅ Extract author URL from href
                                            authorUrl = normalizeFacebookUrl(href);
                                            console.log(`      -> Author (is in): ${authorName}`);
                                            trackStrategy('author', 'is_in_pattern'); // ✅ TAMBAH
                                        }
                                    }
                                }
                            }
                        }
                        
                        // ✅ Strategy 2: Pattern "X and Y and Z others"
                        if (authorName === "N/A") {
                            const multiAuthorContainer = postEl.locator('span.x193iq5w.xeuugli:has(b):has-text(" and ")').first();

                            if (await multiAuthorContainer.count() > 0) {
                                // Multiple authors detected
                                const authorLinks = await multiAuthorContainer.locator('b a[role="link"]').all();
                                const authorNames = [];
                                let firstAuthorUrl = null; // ✅ NEW: Track first author URL

                                for (const link of authorLinks) {
                                    const name = await link.innerText().catch(() => '');
                                    if (name && name.trim()) {
                                        authorNames.push(cleanTextForCSV(name.trim()));
                                        // ✅ Save first author's URL
                                        if (!firstAuthorUrl) {
                                            const href = await link.getAttribute('href');
                                            if (href) {
                                                firstAuthorUrl = href;
                                            }
                                        }
                                    }
                                }
                                
                                // ✅ NEW: Check for "X others" button in this pattern too
                                const othersButton = multiAuthorContainer.locator('div[role="button"]:has-text("others"), b:has-text("others")').first();
                                
                                if (await othersButton.count() > 0) {
                                    console.log(`         -> Found "X others" button in 'and' pattern, hovering...`);
                                    
                                    try {
                                        await othersButton.scrollIntoViewIfNeeded().catch(() => {});
                                        await page.waitForTimeout(500);
                                        await othersButton.hover({ timeout: 3000 });
                                        await page.waitForTimeout(2000);
                                        
                                        const tooltip = page.locator('div[role="tooltip"]:visible, span.x193iq5w.xeuugli:visible').first();
                                        
                                        if (await tooltip.count() > 0) {
                                            const tooltipText = await tooltip.textContent();
                                            
                                            if (tooltipText) {
                                                const hiddenAuthors = tooltipText
                                                    .split(/,|\n|<br>/)
                                                    .map(name => name.trim())
                                                    .filter(name => name && name.length > 0 && !name.match(/^\s*$/))
                                                    .map(name => cleanTextForCSV(name));
                                                
                                                if (hiddenAuthors.length > 0) {
                                                    console.log(`         ✅ Extracted ${hiddenAuthors.length} hidden authors from tooltip`);
                                                    authorNames.push(...hiddenAuthors);
                                                }
                                            }
                                        }
                                        
                                        await page.mouse.move(0, 0).catch(() => {});
                                        
                                    } catch (tooltipError) {
                                        console.log(`         ⚠️ Could not extract tooltip: ${tooltipError.message.substring(0, 40)}`);
                                    }
                                }
                                
                                if (authorNames.length > 0) {
                                    authorName = authorNames.join(' and ');
                                    // ✅ Set author URL from first author
                                    if (firstAuthorUrl) {
                                        authorUrl = normalizeFacebookUrl(firstAuthorUrl);
                                    }
                                    console.log(`      -> Authors (and): ${authorName} (${authorNames.length} authors)`);
                                    trackStrategy('author', 'and_pattern'); // ✅ TAMBAH
                                }
                            }
                        }
                        
                        // ✅ Strategy 3: Standalone "X others" without main author visible
                        if (authorName === "N/A") {
                            const standaloneOthersSelectors = [
                                'span:has-text("others")[role="button"]',
                                'div[role="button"]:has-text("others")',
                                'b:has-text("others")',
                                'span.x4k7w5x:has-text("others")'
                            ];
                            
                            for (const selector of standaloneOthersSelectors) {
                                const othersButton = postEl.locator(selector).first();
                                
                                if (await othersButton.count() > 0) {
                                    console.log(`         -> Found standalone "X others", hovering...`);
                                    
                                    try {
                                        await othersButton.scrollIntoViewIfNeeded().catch(() => {});
                                        await page.waitForTimeout(500);
                                        await othersButton.hover({ timeout: 3000 });
                                        await page.waitForTimeout(2500);
                                        
                                        // Try multiple tooltip selectors
                                        const tooltipSelectors = [
                                            'div[role="tooltip"]:visible span.x193iq5w',
                                            'div[role="tooltip"]:visible',
                                            'span.x193iq5w.xeuugli:visible'
                                        ];
                                        
                                        let tooltipFound = false;
                                        
                                        for (const tooltipSelector of tooltipSelectors) {
                                            const tooltip = page.locator(tooltipSelector).first();
                                            
                                            if (await tooltip.count() > 0) {
                                                const tooltipText = await tooltip.textContent();
                                                
                                                if (tooltipText && tooltipText.length > 5) {
                                                    const hiddenAuthors = tooltipText
                                                        .split(/,|\n|<br>/)
                                                        .map(name => name.trim())
                                                        .filter(name => name && name.length > 0 && !name.match(/^\s*$/))
                                                        .map(name => cleanTextForCSV(name));
                                                    
                                                    if (hiddenAuthors.length > 0) {
                                                        authorName = hiddenAuthors.join(' and ');
                                                        console.log(`         ✅ Extracted ${hiddenAuthors.length} authors from standalone tooltip`);
                                                        console.log(`      -> Authors (others only): ${authorName}`);
                                                        trackStrategy('author', 'standalone_others_tooltip'); // ✅ TAMBAH
                                                        tooltipFound = true;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                        
                                        await page.mouse.move(0, 0).catch(() => {});
                                        
                                        if (tooltipFound) break;
                                        
                                    } catch (tooltipError) {
                                        console.log(`         ⚠️ Could not extract tooltip: ${tooltipError.message.substring(0, 40)}`);
                                    }
                                }
                            }
                        }
                        
                        // Strategy 4: Single author (existing logic - fallback)
                        if (authorName === "N/A") {
                            // ✅ Try to find the parent link element first
                            const authorLinkEl = await postEl.locator('h3 a, h2 a, h4 a, a[role="link"]:has(strong)').first();
                            if (await authorLinkEl.count() > 0) {
                                const strongEl = await authorLinkEl.locator('strong').first();
                                if (await strongEl.count() > 0) {
                                    authorName = cleanTextForCSV(await strongEl.innerText());
                                } else {
                                    authorName = cleanTextForCSV(await authorLinkEl.innerText());
                                }
                                // ✅ Extract author URL from href
                                const href = await authorLinkEl.getAttribute('href');
                                if (href) {
                                    authorUrl = normalizeFacebookUrl(href);
                                }
                                console.log(`      -> Author: ${authorName}`);
                                trackStrategy('author', 'single_author_fallback'); // ✅ TAMBAH
                            }
                        }
                    } catch (authorError) {
                        console.warn(`      ⚠️ Error extract author: ${authorError.message.substring(0, 40)}`);
                    }

                    // ========== EXTRACT LOCATION ==========
                    const location = await extractLocation(postEl);

                    // ========== ✅ EXTRACT MUSIC ==========
                    const musicData = await extractMusic(postEl);

                    // ========== EXPAND "SEE MORE" (Enhanced for REEL) ==========
                    const seeMoreSelectors = [
                        // ✅ NEW: Reel format with nested object
                        'object[type="nested/pressable"] div[role="button"]:has-text("See more")',
                        'object div.x1i10hfl:has-text("See more")',
                        // Original selectors
                        'div[role="button"]:has-text("See more")',
                        'div.xkrqix3.x1sur9pj:has-text("See more")',
                        'div.x1s688f:has-text("See more")'
                    ];
                    
                    for (const selector of seeMoreSelectors) {
                        const seeMoreButton = postEl.locator(selector).first();
                        if (await seeMoreButton.count() > 0) {
                            try {
                                await seeMoreButton.scrollIntoViewIfNeeded().catch(() => {});
                                await page.waitForTimeout(500);
                                await seeMoreButton.click({ timeout: 3000 });
                                await page.waitForTimeout(2000);
                                console.log(`      -> Expanded 'See more'`);
                                break;
                            } catch (e) {
                                console.log(`      -> Could not click 'See more': ${e.message.substring(0, 30)}`);
                            }
                        }
                    }


                    // ========== EXTRACT TEXT CONTENT (with TRANSLATION handling) ==========
                    // ✅ STEP 1: Handle translated posts first
                    const translationHandled = await handleTranslatedContent(page, postEl);
                    if (translationHandled) {
                        console.log(`      -> Translation handled, extracting Indonesian content...`);
                    }

                    // ✅ STEP 2: Extract Indonesian content (priority after translation)
                    const indonesianContentSelectors = [
                        'span[dir="auto"][lang="id-ID"] div[dir="auto"]',
                        'div[data-ad-preview="message"] span[lang="id-ID"] div',
                        'div[data-ad-comet-preview="message"] span[lang="id-ID"] div',
                    ];

                    for (const selector of indonesianContentSelectors) {
                        const contentDivs = await postEl.locator(selector).all();
                        
                        if (contentDivs.length > 0) {
                            const paragraphs = [];
                            
                            for (const div of contentDivs) {
                                const text = await div.textContent() || '';
                                if (text.trim() && !text.includes('See more') && !text.includes('See original')) {
                                    paragraphs.push(text.trim());
                                }
                            }
                            
                            if (paragraphs.length > 0) {
                                contentText = cleanTextForCSV(paragraphs.join(' '));
                                console.log(`      -> Text (Indonesian): ${contentText.substring(0, 50)}...`);
                                trackStrategy('content', 'indonesian_lang_selector_' + indonesianContentSelectors.indexOf(selector)); // ✅ TAMBAH
                                break;
                            }
                        }
                    }

                    // ✅ STEP 3: Fallback to normal extraction
                    if (!contentText) {
                        // Strategy A: REEL content text
                        const reelContentSelectors = [
                            'div.xdj266r.x14z9mp.xat24cr.x1lziwak.x1vvkbs.x126k92a',
                            'div.x14z9mp.xat24cr.x1lziwak.x1vvkbs.xtlvy1s.x126k92a',
                            'div.xf7dkkf.xv54qhq div.x78zum5 div.xdj266r.x14z9mp',
                            'span.x193iq5w.xeuugli > div.xdj266r.x14z9mp'
                        ];
                        
                        for (const selector of reelContentSelectors) {
                            const reelTextEls = await postEl.locator(selector).all();
                            
                            if (reelTextEls.length > 0) {
                                try {
                                    const paragraphs = [];
                                    
                                    for (const el of reelTextEls) {
                                        const rawText = await el.textContent() || '';
                                        if (rawText.trim()) {
                                            paragraphs.push(rawText.trim());
                                        }
                                    }
                                    
                                    if (paragraphs.length > 0) {
                                        const fullText = paragraphs.join(' ');
                                        const cleanedText = fullText
                                            .replace(/#[\w]+\s*/g, '')
                                            .replace(/\s+/g, ' ')
                                            .trim();
                                            
                                        if (cleanedText && cleanedText.length > 0) {
                                            contentText = cleanTextForCSV(cleanedText);
                                            console.log(`      -> Text (reel): ${contentText.substring(0, 50)}...`);
                                            trackStrategy('content', 'reel_selector_' + reelContentSelectors.indexOf(selector)); // ✅ TAMBAH
                                            break;
                                        }
                                    }
                                } catch (e) {}
                            }
                        }
                        
                        // Strategy B: Regular post text
                        if (!contentText) {
                            const textSelectors = [
                                'div[data-ad-preview="message"] span[dir="auto"]',
                                'div[data-ad-comet-preview="message"] span',
                                'div.x11i5rnm.xat24cr span[dir="auto"]'
                            ];
                            
                            for (const selector of textSelectors) {
                                const textEl = await postEl.locator(selector).first();
                                if (await textEl.count() > 0) {
                                    try {
                                        const rawText = await textEl.textContent() || '';
                                        contentText = cleanTextForCSV(rawText);
                                        if (contentText) {
                                            console.log(`      -> Text: ${contentText.substring(0, 50)}...`);
                                            trackStrategy('content', 'regular_post_selector_' + textSelectors.indexOf(selector)); // ✅ TAMBAH
                                            break;
                                        }
                                    } catch (e) {}
                                }
                            }
                        }
                    }


                    // ========== IMAGE/VIDEO DETECTION & SOURCE EXTRACTION ==========
                    if (postUrl.includes('/share/v/') || postUrl.includes('/reel/')) {
                        videoUrl = postUrl;
                        console.log(`      -> Has video (detected from URL)`);
                        
                        try {
                            const videoEl = await postEl.locator('video').first();
                            if (await videoEl.count() > 0) {
                                actualVideoUrl = await videoEl.getAttribute('src');
                                if (!actualVideoUrl) {
                                    const sourceEl = await postEl.locator('video source').first();
                                    if (await sourceEl.count() > 0) {
                                        actualVideoUrl = await sourceEl.getAttribute('src');
                                    }
                                }
                                if (actualVideoUrl && actualVideoUrl !== "N/A") {
                                    console.log(`      -> Video source: ${actualVideoUrl.substring(0, 50)}...`);
                                }
                            }
                        } catch (e) {
                            console.log(`      -> Could not extract video source`);
                        }
                        
                    } else if (postUrl.includes('/share/p/')) {
                        if (await postEl.locator('img[src^="https"]').count() > 0) {
                            imageUrl = postUrl;
                            console.log(`      -> Has image (detected from URL)`);
                            
                            try {
                                const imgElements = await postEl.locator('img[src^="https"]').all();
                                for (const img of imgElements) {
                                    const src = await img.getAttribute('src');
                                    const width = await img.evaluate(el => el.naturalWidth || el.width).catch(() => 0);
                                    
                                    if (src && width > 200 && src.includes('scontent')) {
                                        actualImageUrl = src;
                                        console.log(`      -> Image source: ${actualImageUrl.substring(0, 50)}...`);
                                        break;
                                    }
                                }
                            } catch (e) {
                                console.log(`      -> Could not extract image source`);
                            }
                        } else {
                            console.log(`      -> Text-only post`);
                        }
                        
                    } else {
                        // Traditional URL formats
                        if (await postEl.locator('img[src^="https"]').count() > 0) {
                            imageUrl = postUrl;
                            console.log(`      -> Has image`);
                            
                            try {
                                const imgElements = await postEl.locator('img[src^="https"]').all();
                                for (const img of imgElements) {
                                    const src = await img.getAttribute('src');
                                    const width = await img.evaluate(el => el.naturalWidth || el.width).catch(() => 0);
                                    
                                    if (src && width > 200 && src.includes('scontent')) {
                                        actualImageUrl = src;
                                        console.log(`      -> Image source: ${actualImageUrl.substring(0, 50)}...`);
                                        break;
                                    }
                                }
                            } catch (e) {}
                        }
                        
                        if (await postEl.locator('video').count() > 0 || postUrl.includes('/watch/')) {
                            videoUrl = postUrl;
                            console.log(`      -> Has video${postUrl.includes('/watch/') ? ' (Facebook Watch)' : ''}`);
                            
                            try {
                                const videoEl = await postEl.locator('video').first();
                                if (await videoEl.count() > 0) {
                                    actualVideoUrl = await videoEl.getAttribute('src');
                                    if (!actualVideoUrl) {
                                        const sourceEl = await postEl.locator('video source').first();
                                        if (await sourceEl.count() > 0) {
                                            actualVideoUrl = await sourceEl.getAttribute('src');
                                        }
                                    }
                                    if (actualVideoUrl && actualVideoUrl !== "N/A") {
                                        console.log(`      -> Video source: ${actualVideoUrl.substring(0, 50)}...`);
                                    }
                                }
                            } catch (e) {}
                        }
                    }

                    // ========== ENGAGEMENT EXTRACTION ==========
                    console.log(`      -> Extracting engagement...`);

                    let reactions_total = await extractReactions(postEl, page, i + 1, false);
                    let comments = await extractComments(postEl, page, i + 1, false);
                    let shares = await extractShares(postEl, page, i + 1, false);

                    // ✅ NEW: If this is a reel and engagement is 0, try opening reel page
                    const isReel = postUrl.includes('/reel/');
                    const hasNoEngagement = reactions_total === 0 && comments === 0 && shares === 0;

                    if (isReel && hasNoEngagement) {
                        console.log(`      -> Reel with no engagement detected, opening reel page...`);
                        
                        const reelEngagement = await extractReelEngagementFromPage(page.context(), postUrl);
                        
                        reactions_total = reelEngagement.reactions;
                        comments = reelEngagement.comments;
                        shares = reelEngagement.shares;
                        
                        console.log(`      -> R:${reactions_total} C:${comments} S:${shares} (from reel page)`);
                    } else {
                        console.log(`      -> R:${reactions_total} C:${comments} S:${shares}`);
                    }

                    if (CONFIG.DEBUG_MODE) {
                        await debugPause(`Post #${i + 1} Engagement extracted - R:${reactions_total} C:${comments} S:${shares}`);
                    }


                    // ========== VIDEO VIEWS (only for video posts) ==========
                    let views = 0;
                    if (videoUrl !== "N/A") {
                        views = await extractViews(postEl);
                        
                        if (views === 0) {
                            console.log(`      -> Views not found in feed, opening video page...`);
                            views = await extractVideoViewsFromPage(page.context(), videoUrl);
                        }
                        
                        if (views > 0) {
                            console.log(`      -> Views: ${views}`);
                        }
                    }

                    // ========== EXTRACT SHARE URL ==========
                    console.log(`      -> Getting share URL...`);
                    shareUrl = await extractShareUrl(page, postEl);

                    if (shareUrl !== "N/A") {
                        console.log(`      ✅ Share URL: ${shareUrl}`);
                    } else {
                        console.log(`      -> Could not get share URL`);
                    }

                    // ========== SAVE POST DATA ==========
                    const scraped_at = new Date().toISOString();

                    // ✅ HYBRID MODE: Prepare HTML data
                    let htmlData = {
                        author: authorName,
                        author_url: authorUrl, // ✅ UPDATED: Extract from DOM href attribute
                        author_followers: 0, // Will be filled by GraphQL if available
                        location: location,
                        timestamp: postTimestamp,
                        timestamp_iso: convertToISO(postTimestamp),
                        post_url: postUrl,
                        share_url: shareUrl,
                        content_text: contentText,
                        image_url: imageUrl,
                        video_url: videoUrl,
                        image_source: actualImageUrl,
                        video_source: actualVideoUrl,
                        reactions_total: reactions_total,
                        comments: comments,
                        shares: shares,
                        views: views,
                        music_title: musicData.music_title, // ✅ NEW: Music title
                        music_artist: musicData.music_artist, // ✅ NEW: Music artist
                        query_used: query,
                        filter_year: filterYear || 'recent_mode',
                        scraped_at: scraped_at,
                        updated_at: scraped_at
                    };

                    // ✅ HYBRID MODE: Try to merge with GraphQL data
                    let post = htmlData;
                    if (CONFIG.USE_HYBRID_MODE && latestGraphQLResponse) {
                        const graphqlPost = findGraphQLPostByUrl(latestGraphQLResponse, postUrl);

                        if (graphqlPost) {
                            console.log(`      🔄 GraphQL data found! Merging with HTML data...`);
                            post = mergeDataSources(graphqlPost, htmlData);

                            // Show which source was used for key fields
                            const sources = [];
                            if (post._data_sources) {
                                if (post._data_sources.author) sources.push(`Author:${post._data_sources.author === 'graphql' ? 'API' : 'HTML'}`);
                                if (post._data_sources.timestamp_iso) sources.push(`Time:${post._data_sources.timestamp_iso === 'graphql' ? 'API' : 'HTML'}`);
                                if (post._data_sources.content_text) sources.push(`Text:${post._data_sources.content_text === 'graphql' ? 'API' : 'HTML'}`);
                                if (post._data_sources.reactions_total) sources.push(`React:${post._data_sources.reactions_total === 'graphql' ? 'API' : 'HTML'}`);
                            }

                            if (sources.length > 0) {
                                console.log(`      📊 Data Sources: ${sources.join(', ')}`);
                            }

                            // Remove internal tracking field before saving
                            delete post._data_sources;
                        } else if (CONFIG.PREFER_GRAPHQL) {
                            console.log(`      ℹ️  No GraphQL match, using HTML data`);
                            trackStrategy('data_source', 'html_only');
                        }
                    }

                    const finalPost = post;

                    // ========== ✅ MARK AS SCRAPED - MULTIPLE KEYS ==========
                    allScrapedUrls.add(postUrl);

                    // ✅ Add share_url for reliable duplicate detection
                    if (shareUrl && shareUrl !== "N/A") {
                        allScrapedUrls.add(shareUrl);
                    }

                    if (postId) {
                        allScrapedUrls.add(`postid:${postId}`);
                    }

                    if (actualImageUrl !== "N/A") {
                        const photoId = extractPhotoIdFromImageUrl(actualImageUrl);
                        if (photoId) {
                            allScrapedUrls.add(`photoid:${photoId}`);
                        }
                    }

                    const finalHash = generateContentFingerprint(authorName, postTimestamp, contentText, actualImageUrl);
                    allScrapedUrls.add(`hash:${finalHash}`);

                    postsData.push(finalPost);
                    newPostsInLoop++;

                    allScrapedUrls.add(postUrl);
                    if (postId) allScrapedUrls.add(`postid:${postId}`);
                    if (actualImageUrl !== "N/A") {
                        const photoId = extractPhotoIdFromImageUrl(actualImageUrl);
                        if (photoId) allScrapedUrls.add(`photoid:${photoId}`);
                    }
                    allScrapedUrls.add(`hash:${finalHash}`);

                    const statusLine = `   ✅ [${postsData.length}/${maxPosts}] ${authorName.padEnd(30)} | R:${String(reactions_total).padStart(4)} C:${String(comments).padStart(4)} S:${String(shares).padStart(4)}${views > 0 ? ` V:${String(views).padStart(6)}` : ''}`;
                    console.log(statusLine);

                    // ✅ REALTIME SAVE: Save immediately after extraction
                    const csvFilename = getCSVFilename(filterYear);
                    await savePostRealtime(finalPost, csvFilename);

                    // ✅ COMMENT EXTRACTION: Extract comments for this post
                    if (CONFIG.EXTRACT_COMMENTS) {
                        try {
                            const commentFilename = path.join(CONFIG.csv_base_folder, CONFIG.COMMENT_CSV_FILENAME);
                            // ✅ FIX: Use shareUrl (more reliable) instead of postUrl (can be fbid URL)
                            const commentPostUrl = (shareUrl && shareUrl !== "N/A") ? shareUrl : postUrl;
                            const extractedComments = await extractAllCommentsHybrid(
                                page,
                                postEl,
                                commentPostUrl,
                                authorName,
                                postId
                            );

                            if (extractedComments.length > 0) {
                                await saveCommentsRealtime(extractedComments, commentFilename);
                                // ✅ ALSO SAVE TO JSON
                                const commentFilenameJSON = commentFilename.replace('.csv', '.json');
                                await saveCommentsRealtimeJSON(extractedComments, commentFilenameJSON);

                                // ✅ AUTO-SAVE TO DATABASE
                                if (CONFIG.AUTO_SAVE_TO_DATABASE && isApiAvailable) {
                                    const savedCount = await saveCommentsToDatabase(extractedComments);
                                    if (savedCount > 0) {
                                        console.log(`      🗄️  Auto-saved ${savedCount} comments to PostgreSQL`);
                                    }
                                }
                            }
                        } catch (commentError) {
                            console.warn(`      ⚠️ Comment extraction error: ${commentError.message}`);
                        }
                    }

                    // ✅ VISUAL HIGHLIGHT: Mark as successfully saved
                    await highlightPost(page, postEl, 'success');

                    if (postsData.length >= maxPosts) break;
                    
                    await page.waitForTimeout(500 + Math.random() * 500);
                    
                } catch (error) {
                    skipReasons.otherErrors++;
                    console.warn(`      ❌ ERROR processing post ${i + 1}: ${error.message}`);
                    console.warn(`         Stack: ${error.stack?.substring(0, 200)}`);

                    // ✅ VISUAL HIGHLIGHT: Mark as error
                    await highlightPost(page, postEl, 'error');
                }
            }
            
            if (postsData.length >= maxPosts) break;

            // ========== SCROLL TO LOAD MORE POSTS ==========
            try {
                if (page.isClosed()) break;

                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                console.log(`   > Scrolling... (${postsData.length}/${maxPosts} posts)`);
                await page.waitForTimeout(3000);
                // ✅ Changed: Use domcontentloaded instead of networkidle for better responsiveness
                await page.waitForLoadState('domcontentloaded').catch(() => {});
                await page.waitForTimeout(CONFIG.JEDA_SCROLL_DETIK * 1000 + Math.random() * 2000);
            } catch (scrollError) {
                console.warn(`       ⚠️ Scroll error: ${scrollError.message}`);
                break;
            }
            
            // ========== DETECT STUCK FEED ==========
            if (newPostsInLoop === 0) scrollTanpaHasil++;
            else scrollTanpaHasil = 0;
            
            if (scrollCycleUrls.size === 0) {
                samePostsCount++;
            } else {
                const allSame = [...scrollCycleUrls].every(url => currentScrollUrls.has(url));
                if (allSame && scrollCycleUrls.size > 0) {
                    samePostsCount++;
                    console.log(`   ⚠️ Same posts detected (${samePostsCount}/${CONFIG.MAX_SAME_POSTS_SCROLL})`);
                } else {
                    samePostsCount = 0;
                    currentScrollUrls = new Set(scrollCycleUrls);
                }
            }
            
            if (scrollTanpaHasil >= 5) {
                console.log("   > Berhenti scroll: Tidak ada post baru setelah 5x scroll.");
                break;
            }
            
            if (samePostsCount >= CONFIG.MAX_SAME_POSTS_SCROLL) {
                console.log(`   > Berhenti scroll: Feed stuck (${CONFIG.MAX_SAME_POSTS_SCROLL}x post yang sama).`);
                break;
            }
        }
    } catch (error) {
        console.error(`❌ Error saat scraping query "${query}": ${error.message}`);
        await page.screenshot({ path: `error_screenshot_${query.replace(/\s+/g, '_')}.png` }).catch(() => {});
    }
    
    const totalInspected = postsData.length + Object.values(skipReasons).reduce((a, b) => a + b, 0);
    
    console.log(`\n📊 SCRAPING SUMMARY for "${query}"${yearLabel}:`);
    console.log(`   ✅ Data scraped: ${postsData.length}`);
    console.log(`   📋 Skip breakdown:`);
    console.log(`      • Already in DB: ${skipReasons.alreadyScraped}`);
    console.log(`      • No valid link: ${skipReasons.noValidLink}`);
    console.log(`      • Invalid timestamp: ${skipReasons.invalidTimestamp}`);
    console.log(`      • Invalid URL: ${skipReasons.invalidUrl}`);
    console.log(`      • Detached element: ${skipReasons.detachedElement}`);
    console.log(`      • Other errors: ${skipReasons.otherErrors}`);
    console.log(`   📈 Total posts inspected: ${totalInspected}`);
    
    const csvFilename = getCSVFilename(filterYear);
    console.log(`\n💾 Menyimpan ${postsData.length} data ke: ${csvFilename}...`);
    await saveData(postsData, csvFilename);

    // ✅ Update counter & save report
    totalPostsProcessed += postsData.length;
    saveStrategyReport(); // Auto-save setiap selesai scrape query

    return postsData.length;
}

/**
 * ✅ REALTIME SAVE: Save single post immediately to CSV
 */
async function savePostRealtime(post, postFile) {
    try {
        const fileExists = fs.existsSync(postFile);

        // Write BOM untuk Excel compatibility (only if new file)
        if (!fileExists) {
            fs.writeFileSync(postFile, '\ufeff');
        }

        const postWriter = createObjectCsvWriter({
            path: postFile,
            header: [
                {id: 'author', title: 'author'},
                {id: 'author_url', title: 'author_url'},
                {id: 'author_followers', title: 'author_followers'},
                {id: 'location', title: 'location'},
                {id: 'timestamp', title: 'timestamp'},
                {id: 'timestamp_iso', title: 'timestamp_iso'},
                {id: 'post_url', title: 'post_url'},
                {id: 'share_url', title: 'share_url'},
                {id: 'content_text', title: 'content_text'},
                {id: 'image_url', title: 'image_url'},
                {id: 'video_url', title: 'video_url'},
                {id: 'image_source', title: 'image_source'},
                {id: 'video_source', title: 'video_source'},
                {id: 'reactions_total', title: 'reactions_total'},
                {id: 'comments', title: 'comments'},
                {id: 'shares', title: 'shares'},
                {id: 'views', title: 'views'},
                {id: 'music_title', title: 'music_title'},
                {id: 'music_artist', title: 'music_artist'},
                {id: 'query_used', title: 'query_used'},
                {id: 'filter_year', title: 'filter_year'},
                {id: 'scraped_at', title: 'scraped_at'},
                {id: 'updated_at', title: 'updated_at'}
            ],
            append: fileExists,
            alwaysQuote: true,
            encoding: 'utf8',
            fieldDelimiter: ',',
        });

        await postWriter.writeRecords([post]);
        fs.chmodSync(postFile, CONFIG.FILE_PERMISSIONS);

        console.log(`      💾 Realtime saved to ${postFile}`);

        // ✅ ALSO SAVE TO JSON
        const postFileJSON = postFile.replace('.csv', '.json');
        await savePostsRealtimeJSON([post], postFileJSON);

        // ✅ AUTO-SAVE TO DATABASE
        if (CONFIG.AUTO_SAVE_TO_DATABASE && isApiAvailable) {
            const dbSaved = await savePostToDatabase(post);
            if (dbSaved) {
                console.log(`      🗄️  Auto-saved to PostgreSQL database`);
            }
        }

    } catch (error) {
        console.warn(`      ⚠️ Realtime save error: ${error.message}`);
    }
}

/**
 * ✅ ADD VISUAL HIGHLIGHT: Highlight post being processed in browser
 */
async function highlightPost(page, postEl, action = 'start') {
    try {
        if (action === 'start') {
            await postEl.evaluate(el => {
                el.style.border = '4px solid #00ff00';
                el.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
                el.style.transition = 'all 0.3s ease';
            });
        } else if (action === 'success') {
            await postEl.evaluate(el => {
                el.style.border = '4px solid #0080ff';
                el.style.backgroundColor = 'rgba(0, 128, 255, 0.1)';
            });
            await page.waitForTimeout(500);
            await postEl.evaluate(el => {
                el.style.border = '';
                el.style.backgroundColor = '';
            });
        } else if (action === 'error') {
            await postEl.evaluate(el => {
                el.style.border = '4px solid #ff0000';
                el.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            });
        }
    } catch (e) {
        // Ignore highlight errors
    }
}

/**
 * ✅ FIXED: Save data dengan UTF-8 encoding + BOM + PROPER CSV ESCAPING
 */
async function saveData(posts, postFile) {
    if (posts.length > 0) {
        const fileExists = fs.existsSync(postFile);

        // Write BOM untuk Excel compatibility
        if (!fileExists) {
            fs.writeFileSync(postFile, '\ufeff');
        }

        const postWriter = createObjectCsvWriter({
            path: postFile,
            header: [
                {id: 'author', title: 'author'},
                {id: 'author_url', title: 'author_url'},
                {id: 'author_followers', title: 'author_followers'},
                {id: 'location', title: 'location'},
                {id: 'timestamp', title: 'timestamp'},
                {id: 'timestamp_iso', title: 'timestamp_iso'},
                {id: 'post_url', title: 'post_url'},
                {id: 'share_url', title: 'share_url'},
                {id: 'content_text', title: 'content_text'},
                {id: 'image_url', title: 'image_url'},
                {id: 'video_url', title: 'video_url'},
                {id: 'image_source', title: 'image_source'},
                {id: 'video_source', title: 'video_source'},
                {id: 'reactions_total', title: 'reactions_total'},
                {id: 'comments', title: 'comments'},
                {id: 'shares', title: 'shares'},
                {id: 'views', title: 'views'},
                {id: 'music_title', title: 'music_title'},
                {id: 'music_artist', title: 'music_artist'},
                {id: 'query_used', title: 'query_used'},
                {id: 'filter_year', title: 'filter_year'},
                {id: 'scraped_at', title: 'scraped_at'},
                {id: 'updated_at', title: 'updated_at'}
            ],
            append: fileExists,
            alwaysQuote: true,  // ✅ PENTING: Force quote semua field
            encoding: 'utf8',
            fieldDelimiter: ',', // ✅ Explicit comma delimiter
        });

        await postWriter.writeRecords(posts);
        fs.chmodSync(postFile, CONFIG.FILE_PERMISSIONS);

        console.log(`✅ Data disimpan ke ${postFile}. Total: ${posts.length} posts`);
        log('INFO', `Data saved to ${postFile}`, { count: posts.length });
    }
}

/**
 * ✅ NEW: Update Recent Posts Engagement (Sequential, Share URL Only)
 *
 * Updates engagement for recent posts (last 30 days) after scraping
 * - ONLY uses share_url (reliable, no fbid URLs)
 * - Updates oldest posts first (sequential, no random)
 * - Shows delta (+/-) for each metric
 * - Tracks update_count and last_updated_at
 *
 * @param {Page} page - Playwright page instance
 * @param {number} recentScrapedCount - Number of posts just scraped
 * @returns {Promise<{updated: number, failed: number, skipped: number}>}
 */
async function updateRecentPostsEngagement(page, recentScrapedCount) {
    console.log(`\n🔄 UPDATE ENGAGEMENT - Recent Posts (Last ${CONFIG.UPDATE_RECENT_DAYS} Days)`);
    console.log(`   Target: Update ${recentScrapedCount} oldest posts`);

    const csvFile = path.join(CONFIG.csv_base_folder, CONFIG.csv_recent_filename);

    if (!fs.existsSync(csvFile)) {
        console.log(`   ℹ️  No recent_posts.csv found, skipping update`);
        return { updated: 0, failed: 0, skipped: 0 };
    }

    // ========== LOAD POSTS ==========
    const posts = [];
    await new Promise((resolve) => {
        fs.createReadStream(csvFile)
            .pipe(csvParser())
            .on('data', (row) => posts.push(row))
            .on('end', resolve);
    });

    if (posts.length === 0) {
        console.log(`   ℹ️  No posts to update`);
        return { updated: 0, failed: 0, skipped: 0 };
    }

    console.log(`   📂 Loaded: ${posts.length} posts from recent_posts.csv`);

    // ========== FILTER: Last 30 Days ==========
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.UPDATE_RECENT_DAYS);

    const recentPosts = posts.filter(post => {
        const scrapedAt = post.scraped_at ? new Date(post.scraped_at) : null;
        return scrapedAt && scrapedAt >= cutoffDate;
    });

    console.log(`   📅 Last ${CONFIG.UPDATE_RECENT_DAYS} days: ${recentPosts.length} posts`);

    // ========== SORT: Oldest First ==========
    recentPosts.sort((a, b) => {
        const dateA = a.scraped_at ? new Date(a.scraped_at) : new Date(0);
        const dateB = b.scraped_at ? new Date(b.scraped_at) : new Date(0);
        return dateA - dateB; // Oldest first
    });

    // ========== SELECT: First N Posts ==========
    const postsToUpdate = recentPosts.slice(0, recentScrapedCount);
    console.log(`   🎯 Will update: ${postsToUpdate.length} posts (oldest first)\n`);
    console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // ========== UPDATE LOOP ==========
    let updatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Create error folder if needed
    if (!fs.existsSync(CONFIG.UPDATE_ERROR_DIR)) {
        fs.mkdirSync(CONFIG.UPDATE_ERROR_DIR, { recursive: true });
    }

    for (let i = 0; i < postsToUpdate.length; i++) {
        const post = postsToUpdate[i];

        try {
            // Calculate post age
            const scrapedAt = post.scraped_at ? new Date(post.scraped_at) : null;
            const daysAgo = scrapedAt ? Math.floor((Date.now() - scrapedAt.getTime()) / (1000 * 60 * 60 * 24)) : '?';

            console.log(`   [${i + 1}/${postsToUpdate.length}] 📍 ${post.author || 'Unknown'} - ${daysAgo} days ago`);

            // ========== URL VALIDATION: Share URL Only ==========
            if (!post.share_url || post.share_url === "N/A" || post.share_url === "") {
                console.log(`      ⏭️  Skipping: No reliable share_url`);
                skippedCount++;
                continue;
            }

            // Validate URL format (must be /share/ or /reel/)
            if (!post.share_url.includes('facebook.com/share/') && !post.share_url.includes('facebook.com/reel/')) {
                console.log(`      ⚠️  Invalid share_url format (not /share/ or /reel/)`);
                console.log(`         URL: ${post.share_url.substring(0, 60)}...`);
                skippedCount++;
                continue;
            }

            const updateUrl = post.share_url;
            console.log(`      → Opening: ${updateUrl.substring(0, 80)}...`);

            // ========== OPEN PAGE ==========
            const gotoResult = await page.goto(updateUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            }).catch((err) => {
                console.warn(`      ⚠️  Page load error: ${err.message.substring(0, 40)}`);
                return null;
            });

            if (!gotoResult) {
                failedCount++;
                continue;
            }

            await page.waitForTimeout(2000 + Math.random() * 1000);

            // ========== EXTRACT NEW ENGAGEMENT ==========
            console.log(`      → Extracting engagement...`);

            // Get post element (assume first post on page)
            const postEl = page.locator('div[role="article"]').first();

            if (await postEl.count() === 0) {
                console.log(`      ⚠️  No post element found`);
                failedCount++;
                continue;
            }

            // Extract new values
            const newReactions = await extractReactions(postEl, page, 1, false);
            const newComments = await extractComments(postEl, page, 1, false);
            const newShares = await extractShares(postEl, page, 1, false);

            // Extract views (only for videos)
            let newViews = 0;
            if (updateUrl.includes('/reel/') || updateUrl.includes('/watch/')) {
                newViews = await extractViews(postEl);
                if (newViews === 0) {
                    newViews = await extractVideoViewsFromPage(page.context(), updateUrl);
                }
            }

            // ========== VALIDATION ==========
            if (newReactions === 0 && newComments === 0 && newShares === 0 && newViews === 0) {
                console.log(`      ⚠️  Extraction failed: All metrics are 0`);
                console.log(`      → Keeping old values`);

                // Save error screenshot
                try {
                    const errorPath = path.join(CONFIG.UPDATE_ERROR_DIR, `error_${Date.now()}.png`);
                    await page.screenshot({ path: errorPath, fullPage: true });
                    console.log(`      📸 Screenshot saved: ${errorPath}`);
                } catch (e) {}

                failedCount++;
                continue;
            }

            // ========== CALCULATE DELTA ==========
            const oldReactions = parseInt(post.reactions || 0);
            const oldComments = parseInt(post.comments || 0);
            const oldShares = parseInt(post.shares || 0);
            const oldViews = parseInt(post.views || 0);

            const deltaReactions = newReactions - oldReactions;
            const deltaComments = newComments - oldComments;
            const deltaShares = newShares - oldShares;
            const deltaViews = newViews - oldViews;

            // ========== UPDATE POST DATA ==========
            post.reactions = newReactions;
            post.comments = newComments;
            post.shares = newShares;
            post.views = newViews;
            post.update_count = (parseInt(post.update_count || 0)) + 1;
            post.last_updated_at = new Date().toISOString();
            post.updated_at = new Date().toISOString();

            // ========== DISPLAY WITH DELTA ==========
            if (CONFIG.UPDATE_RECENT_SHOW_DELTA) {
                const formatDelta = (delta) => {
                    if (delta > 0) return `\x1b[32m+${delta.toLocaleString()}\x1b[0m`;      // Green
                    if (delta < 0) return `\x1b[31m${delta.toLocaleString()}\x1b[0m`;        // Red
                    return `\x1b[33m±0\x1b[0m`;                              // Yellow
                };

                console.log(`      → OLD: R:${oldReactions.toLocaleString().padStart(6)}  C:${oldComments.toLocaleString().padStart(5)}  S:${oldShares.toLocaleString().padStart(5)}  V:${oldViews.toLocaleString().padStart(7)}`);
                console.log(`      → NEW: R:${newReactions.toLocaleString().padStart(6)}  C:${newComments.toLocaleString().padStart(5)}  S:${newShares.toLocaleString().padStart(5)}  V:${newViews.toLocaleString().padStart(7)}`);
                console.log(`      ✅ R:${newReactions.toLocaleString()} (${formatDelta(deltaReactions)}) C:${newComments.toLocaleString()} (${formatDelta(deltaComments)}) S:${newShares.toLocaleString()} (${formatDelta(deltaShares)}) ${newViews > 0 ? `V:${newViews.toLocaleString()} (${formatDelta(deltaViews)})` : ''} [Update #${post.update_count}]`);
            } else {
                console.log(`      ✅ R:${newReactions.toLocaleString()} C:${newComments.toLocaleString()} S:${newShares.toLocaleString()} ${newViews > 0 ? `V:${newViews.toLocaleString()}` : ''} [Update #${post.update_count}]`);
            }

            updatedCount++;

            // Delay before next post
            await page.waitForTimeout(CONFIG.UPDATE_RECENT_DELAY_MS);

        } catch (error) {
            console.warn(`      ❌ Error: ${error.message}`);
            failedCount++;
        }

        console.log(''); // Empty line between posts
    }

    console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // ========== SAVE UPDATED CSV ==========
    console.log(`   📊 UPDATE SUMMARY:`);
    console.log(`      • Processed: ${postsToUpdate.length} posts`);
    console.log(`      • Updated: ${updatedCount} posts`);
    console.log(`      • Failed: ${failedCount} posts`);
    console.log(`      • Skipped: ${skippedCount} posts (no valid share_url)`);

    // Save to CSV
    try {
        const headers = Object.keys(posts[0]);

        // Ensure new columns exist
        if (!headers.includes('update_count')) {
            posts.forEach(p => { if (!p.update_count) p.update_count = 0; });
        }
        if (!headers.includes('last_updated_at')) {
            posts.forEach(p => { if (!p.last_updated_at) p.last_updated_at = ''; });
        }

        const csvWriter = createObjectCsvWriter({
            path: csvFile,
            header: headers.map(h => ({ id: h, title: h })),
            alwaysQuote: true,
            encoding: 'utf8'
        });

        await csvWriter.writeRecords(posts);
        console.log(`\n   💾 Saved to: ${csvFile}`);
        console.log(`      ✅ All changes written successfully\n`);

    } catch (error) {
        console.error(`   ❌ Failed to save CSV: ${error.message}`);
    }

    return {
        updated: updatedCount,
        failed: failedCount,
        skipped: skippedCount
    };
}

/**
 * ✅ SIMPLIFIED: Update Engagement - DIRECT OVERWRITE
 */
async function updateEngagement(page, batchSize) {
    console.log(`\n🔄 UPDATE ENGAGEMENT - Direct overwrite mode`);
    
    const csvFiles = [];
    
    // Collect all CSV files
    for (const year of CONFIG.FILTER_YEARS) {
        const filename = getCSVFilename(year);
        if (fs.existsSync(filename)) {
            csvFiles.push(filename);
        }
    }
    
    const recentFile = getCSVFilename(null);
    if (fs.existsSync(recentFile)) {
        csvFiles.push(recentFile);
    }
    
    if (csvFiles.length === 0) {
        console.log("ℹ️ Tidak ada CSV untuk update engagement.");
        return;
    }
    
    console.log(`   Found ${csvFiles.length} CSV files to update`);
    
    // ✅ Create error folder
    const errorFolder = './update_errors';
    if (!fs.existsSync(errorFolder)) {
        fs.mkdirSync(errorFolder, { recursive: true });
    }
    
    for (const csvFile of csvFiles) {
        console.log(`\n   📂 Processing: ${csvFile}`);
        
        await new Promise((resolve) => {
            const posts = [];
            
            fs.createReadStream(csvFile)
                .pipe(csvParser())
                .on('data', (row) => posts.push(row))
                .on('end', async () => {
                    if (posts.length === 0) {
                        console.log("      ℹ️ No data to update");
                        resolve();
                        return;
                    }
                    
                    console.log(`      Total posts in file: ${posts.length}`);
                    
                    // ✅ Randomize
                    posts.sort(() => Math.random() - 0.5);
                    
                    // ✅ Take sample
                    const sampleToUpdate = posts.slice(0, batchSize);
                    console.log(`      -> Will update: ${sampleToUpdate.length} posts\n`);
                    
                    let updatedCount = 0;
                    let skippedCount = 0;
                    let noShareUrlCount = 0;
                    
                    for (let i = 0; i < sampleToUpdate.length; i++) {
                        const post = sampleToUpdate[i];
                        let updateUrl = null;
                        
                        try {
                            console.log(`      [${i + 1}/${sampleToUpdate.length}] 🔄 ${post.author || 'Unknown'}`);
                            
                            // ========== STEP 1: DETERMINE URL TO USE ==========
                            // Priority 1: share_url
                            if (post.share_url && post.share_url !== "N/A" && post.share_url.includes('facebook.com')) {
                                updateUrl = post.share_url;
                                console.log(`         -> Using share_url`);
                            }
                            // Priority 2: post_url
                            else if (post.post_url && post.post_url !== "N/A") {
                                updateUrl = post.post_url;
                                console.log(`         -> Using post_url (no share_url available)`);
                                noShareUrlCount++;
                            }
                            // Priority 3: Skip (no valid URL)
                            else {
                                console.log(`         ❌ No valid URL - skipping`);
                                skippedCount++;
                                continue;
                            }
                            
                            console.log(`         -> Opening: ${updateUrl.substring(0, 80)}...`);
                            
                            // ========== STEP 2: OPEN PAGE ==========
                            const gotoResult = await page.goto(updateUrl, { 
                                waitUntil: 'domcontentloaded', 
                                timeout: 30000 
                            }).catch((err) => {
                                console.warn(`         ⚠️ Page load error: ${err.message.substring(0, 40)}`);
                                return null;
                            });
                            
                            if (!gotoResult) {
                                skippedCount++;
                                continue;
                            }
                            
                            await page.waitForTimeout(4000);
                            await page.waitForSelector('div[role="main"]', { timeout: 10000 }).catch(() => {});
                            await page.waitForTimeout(2000);
                            
                            // ========== STEP 3: EXTRACT ENGAGEMENT (SIMPLE) ==========
                            let reactions_total = 0;
                            let comments = 0;
                            let shares = 0;
                            
                            const oldReactions = parseInt(post.reactions_total) || 0;
                            const oldComments = parseInt(post.comments) || 0;
                            const oldShares = parseInt(post.shares) || 0;
                            
                            // --- REACTIONS ---
                            try {
                                // Try multiple selectors
                                const reactionSelectors = [
                                    'div[aria-label="Like"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft.x1j85h84',
                                    'span.xt0b8zv span.html-span.xdj266r',
                                    'div:has-text("All reactions:") span.xt0b8zv',
                                    'div:has-text("All reactions:") span',
                                    'span[aria-label*="reaction"]'
                                ];
                                
                                for (const selector of reactionSelectors) {
                                    const el = await page.locator(selector).first();
                                    if (await el.count() > 0) {
                                        const text = await el.textContent().catch(() => '') || 
                                                    await el.getAttribute('aria-label').catch(() => '');
                                        
                                        if (text && text.match(/\d/)) {
                                            reactions_total = parseEngagementCount(text);
                                            if (reactions_total > 0) break;
                                        }
                                    }
                                }
                            } catch (e) {}
                            
                            // --- COMMENTS ---
                            try {
                                const commentSelectors = [
                                    'div[aria-label="Comment"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft.x1j85h84',
                                    'span.html-span.xkrqix3.x1sur9pj:has-text("comment")',
                                    'span:has-text("comment")'
                                ];
                                
                                for (const selector of commentSelectors) {
                                    const elements = await page.locator(selector).all();
                                    
                                    for (const el of elements) {
                                        const text = await el.textContent().catch(() => '');
                                        
                                        if (text && text.toLowerCase().includes('comment')) {
                                            const match = text.match(/(\d+[\d,.]*(K|k|M|m)?)\s*comment/i);
                                            if (match) {
                                                comments = parseEngagementCount(match[1]);
                                                if (comments > 0) break;
                                            }
                                        }
                                    }
                                    
                                    if (comments > 0) break;
                                }
                            } catch (e) {}
                            
                            // --- SHARES ---
                            try {
                                const shareSelectors = [
                                    'div[aria-label="Share"][role="button"] span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6.xlyipyv.xuxw1ft.x1j85h84',
                                    'div[aria-label="Send"][role="button"] span.x1lliihq',
                                    'span.html-span.xkrqix3.x1sur9pj:has-text("share")',
                                    'span:has-text("share")'
                                ];
                                
                                for (const selector of shareSelectors) {
                                    const elements = await page.locator(selector).all();
                                    
                                    for (const el of elements) {
                                        const text = await el.textContent().catch(() => '');
                                        
                                        if (text && text.toLowerCase().includes('share')) {
                                            const match = text.match(/(\d+[\d,.]*(K|k|M|m)?)\s*share/i);
                                            if (match) {
                                                shares = parseEngagementCount(match[1]);
                                                if (shares > 0) break;
                                            }
                                        }
                                    }
                                    
                                    if (shares > 0) break;
                                }
                            } catch (e) {}
                            
                            // ========== STEP 4: IF NO SHARE_URL, TRY TO EXTRACT IT ==========
                            if (post.share_url === "N/A" || !post.share_url) {
                                console.log(`         -> No share_url, trying to extract...`);
                                
                                try {
                                    // Find Share button
                                    const shareButton = await page.locator(
                                        'div[aria-label="Send this to friends or post it on your profile."][role="button"], ' +
                                        'div[aria-label*="Share"][role="button"]'
                                    ).first();
                                    
                                    if (await shareButton.count() > 0) {
                                        await shareButton.scrollIntoViewIfNeeded().catch(() => {});
                                        await page.waitForTimeout(500);
                                        await shareButton.click({ timeout: 5000 });
                                        await page.waitForTimeout(2500);
                                        
                                        // Find Copy link
                                        const copyLinkButton = await page.locator(
                                            'div[role="button"]:has(span:has-text("Copy link"))'
                                        ).first();
                                        
                                        if (await copyLinkButton.count() > 0) {
                                            // Clear clipboard
                                            await page.evaluate(() => navigator.clipboard.writeText('')).catch(() => {});
                                            await page.waitForTimeout(300);
                                            
                                            // Click Copy link
                                            await copyLinkButton.click({ timeout: 3000 });
                                            await page.waitForTimeout(1000);
                                            
                                            // Read clipboard
                                            const clipboardContent = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
                                            
                                            if (clipboardContent && clipboardContent.includes('facebook.com')) {
                                                post.share_url = clipboardContent;
                                                console.log(`         ✅ Extracted share_url: ${clipboardContent.substring(0, 60)}...`);
                                            }
                                        }
                                        
                                        // Close dialog
                                        await page.keyboard.press('Escape');
                                        await page.waitForTimeout(500);
                                    }
                                } catch (extractError) {
                                    console.log(`         ⚠️ Could not extract share_url: ${extractError.message.substring(0, 40)}`);
                                }
                            }
                            
                            // ========== STEP 5: VALIDATION ==========
                            // ✅ If extraction got 0 but old value exists, keep old
                            if (reactions_total === 0 && oldReactions > 0) {
                                console.log(`         ⚠️ Reactions extraction failed (${oldReactions} → 0), keeping old`);
                                reactions_total = oldReactions;
                            }
                            
                            if (comments === 0 && oldComments > 0) {
                                console.log(`         ⚠️ Comments extraction failed (${oldComments} → 0), keeping old`);
                                comments = oldComments;
                            }
                            
                            if (shares === 0 && oldShares > 0) {
                                console.log(`         ⚠️ Shares extraction failed (${oldShares} → 0), keeping old`);
                                shares = oldShares;
                            }
                            
                            // ✅ Check if anything changed
                            const hasChanges = 
                                reactions_total !== oldReactions || 
                                comments !== oldComments || 
                                shares !== oldShares ||
                                (post.share_url !== "N/A" && post.share_url !== row.share_url);
                            
                            if (!hasChanges) {
                                console.log(`         ℹ️  No changes detected - skipping`);
                                skippedCount++;
                                continue;
                            }
                            
                            // ========== STEP 6: UPDATE POST DATA ==========
                            post.reactions_total = reactions_total;
                            post.comments = comments;
                            post.shares = shares;
                            post.updated_at = new Date().toISOString();
                            
                            updatedCount++;
                            
                            const deltaR = reactions_total - oldReactions;
                            const deltaC = comments - oldComments;
                            const deltaS = shares - oldShares;
                            
                            const formatDelta = (delta) => delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0';
                            console.log(`         ✅ R:${reactions_total} (${formatDelta(deltaR)}) C:${comments} (${formatDelta(deltaC)}) S:${shares} (${formatDelta(deltaS)})`);
                            
                            // Human-like delay
                            await page.waitForTimeout(3000 + Math.random() * 2000);
                            
                        } catch (error) {
                            console.warn(`         ⚠️ Error processing post: ${error.message.substring(0, 50)}`);
                            skippedCount++;
                            
                            // ✅ SAVE ERROR HTML
                            try {
                                const timestamp = Date.now();
                                const errorHtmlFile = path.join(errorFolder, `error_update_${i + 1}_${timestamp}.html`);
                                
                                const pageContent = await page.content().catch(() => '<html><body>Could not get page content</body></html>');
                                
                                const errorData = {
                                    timestamp: new Date().toISOString(),
                                    post_author: post.author,
                                    post_url: post.post_url,
                                    share_url: post.share_url,
                                    update_url: updateUrl,
                                    error_message: error.message,
                                    error_stack: error.stack
                                };
                                
                                const fullHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Error Update Post - ${post.author}</title>
    <style>
        .error-info { 
            background: #fee; 
            padding: 20px; 
            margin: 20px; 
            border: 2px solid #c00;
            font-family: monospace;
        }
        .error-info h2 { color: #c00; }
        .error-info pre { background: #fff; padding: 10px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="error-info">
        <h2>❌ Update Error</h2>
        <p><strong>Timestamp:</strong> ${errorData.timestamp}</p>
        <p><strong>Author:</strong> ${errorData.post_author}</p>
        <p><strong>Post URL:</strong> <a href="${errorData.post_url}">${errorData.post_url}</a></p>
        <p><strong>Share URL:</strong> <a href="${errorData.share_url}">${errorData.share_url}</a></p>
        <p><strong>Update URL Used:</strong> <a href="${errorData.update_url}">${errorData.update_url}</a></p>
        <p><strong>Error:</strong></p>
        <pre>${errorData.error_message}</pre>
        <p><strong>Stack:</strong></p>
        <pre>${errorData.error_stack}</pre>
    </div>
    <hr>
    <h2>Page Content (for debugging):</h2>
    ${pageContent}
</body>
</html>
`;
                                
                                fs.writeFileSync(errorHtmlFile, fullHtml);
                                fs.chmodSync(errorHtmlFile, CONFIG.FILE_PERMISSIONS);
                                
                                console.log(`         📁 Error HTML saved: ${errorHtmlFile}`);
                                
                            } catch (saveError) {
                                console.error(`         ❌ Could not save error HTML: ${saveError.message}`);
                            }
                        }
                    }
                    
                    // ========== SAVE UPDATED DATA ==========
                    if (updatedCount > 0) {
                        console.log(`\n      💾 Saving ${updatedCount} updated posts...`);
                        
                        const writer = createObjectCsvWriter({
                            path: csvFile,
                            header: Object.keys(posts[0]).map(id => ({id, title: id})),
                            alwaysQuote: true,
                            encoding: 'utf8',
                            fieldDelimiter: ','
                        });
                        
                        await writer.writeRecords(posts);
                        fs.chmodSync(csvFile, CONFIG.FILE_PERMISSIONS);
                        
                        console.log(`      ✅ ${updatedCount} posts updated in ${csvFile}`);
                        log('INFO', 'Engagement updated', {
                            file: csvFile,
                            updated: updatedCount,
                            skipped: skippedCount,
                            no_share_url: noShareUrlCount
                        });
                    }
                    
                    console.log(`\n      📊 Summary:`);
                    console.log(`         • Updated: ${updatedCount}`);
                    console.log(`         • Skipped: ${skippedCount}`);
                    console.log(`         • Posts without share_url: ${noShareUrlCount}`);
                    
                    resolve();
                });
        });
    }
    
    console.log(`\n✅ Update engagement completed!`);
}


/**
 * ✅ NEW: Update Video Views from individual video pages
 */
async function updateVideoViews(page, batchSize) {
    console.log(`\n🎬 UPDATE VIDEO VIEWS - Opening video pages...`);
    
    const csvFiles = [];
    
    // Collect all CSV files
    for (const year of CONFIG.FILTER_YEARS) {
        const filename = getCSVFilename(year);
        if (fs.existsSync(filename)) {
            csvFiles.push(filename);
        }
    }
    
    const recentFile = getCSVFilename(null);
    if (fs.existsSync(recentFile)) {
        csvFiles.push(recentFile);
    }
    
    if (csvFiles.length === 0) {
        console.log("ℹ️ Tidak ada CSV untuk update views.");
        return;
    }
    
    console.log(`   Found ${csvFiles.length} CSV files to update`);
    
    for (const csvFile of csvFiles) {
        console.log(`\n   📂 Processing: ${csvFile}`);
        
        await new Promise((resolve) => {
            const posts = [];
            
            fs.createReadStream(csvFile)
                .pipe(csvParser())
                .on('data', (row) => posts.push(row))
                .on('end', async () => {
                    if (posts.length === 0) {
                        console.log("      ℹ️ No data to update");
                        resolve();
                        return;
                    }

                    console.log(`      Total posts in file: ${posts.length}`);

                    // ✅ FILTER: Only posts with video
                    const postsWithVideo = posts.filter(p => {
                        const hasVideoUrl = p.video_url && p.video_url !== "N/A";
                        const hasVideoInShareUrl = p.share_url && 
                            p.share_url !== "N/A" && 
                            (p.share_url.includes('/videos/') || 
                             p.share_url.includes('/watch/') || 
                             p.share_url.includes('/reel/'));
                        
                        return hasVideoUrl || hasVideoInShareUrl;
                    });
                    
                    const postsWithoutVideo = posts.length - postsWithVideo.length;

                    console.log(`      • Posts dengan video: ${postsWithVideo.length}`);
                    console.log(`      • Posts tanpa video: ${postsWithoutVideo} (will skip)`);

                    if (postsWithVideo.length === 0) {
                        console.log("      ℹ️ No video posts to update");
                        resolve();
                        return;
                    }

                    // ✅ Randomize untuk variasi
                    postsWithVideo.sort(() => Math.random() - 0.5);

                    // ✅ Ambil sample sesuai batchSize
                    const sampleToUpdate = postsWithVideo.slice(0, batchSize);

                    console.log(`      -> Will update: ${sampleToUpdate.length} video posts\n`);

                    let updatedCount = 0;
                    let skippedCount = 0;

                    for (let i = 0; i < sampleToUpdate.length; i++) {
                        const post = sampleToUpdate[i];
                        
                        try {
                            // Determine which URL to use (prefer video_url)
                            let videoPageUrl = null;
                            
                            if (post.video_url && post.video_url !== "N/A") {
                                videoPageUrl = post.video_url;
                            } else if (post.share_url && post.share_url !== "N/A" && 
                                      (post.share_url.includes('/videos/') || 
                                       post.share_url.includes('/watch/') || 
                                       post.share_url.includes('/reel/'))) {
                                videoPageUrl = post.share_url;
                            }
                            
                            if (!videoPageUrl) {
                                console.log(`      [${i + 1}/${sampleToUpdate.length}] ⏭️  Skipped: No valid video URL`);
                                skippedCount++;
                                continue;
                            }
                            
                            console.log(`      [${i + 1}/${sampleToUpdate.length}] 🎬 ${post.author || 'Unknown'}`);
                            console.log(`         -> Opening: ${videoPageUrl.substring(0, 80)}...`);
                            
                            // ========== OPEN VIDEO URL ==========
                            const gotoResult = await page.goto(videoPageUrl, { 
                                waitUntil: 'domcontentloaded', 
                                timeout: 30000 
                            }).catch((err) => {
                                console.warn(`         ⚠️ Page load error: ${err.message.substring(0, 40)}`);
                                return null;
                            });
                            
                            if (!gotoResult) {
                                skippedCount++;
                                continue;
                            }
                            
                            // Wait for page to fully load
                            await page.waitForTimeout(4000);

                            // ========== WAIT FOR VIDEO PLAYER ==========
                            await page.waitForSelector('video, div[role="main"]', { timeout: 10000 }).catch(() => {
                                console.log(`         ⚠️ Video player not found`);
                            });
                            
                            await page.waitForTimeout(2000);

                            const oldViews = parseInt(post.views) || 0;
                            let views = 0;

                            // ========== EXTRACT VIEWS ==========
                            try {
                                // Strategy 1: Exact selector from HTML (priority)
                                const viewsSelectors = [
                                    // Primary: Exact match dari HTML yang Anda berikan
                                    'span._26fq span.x193iq5w:has-text("views")',
                                    'span._26fq span:has-text("views")',
                                    // Secondary: Class variations
                                    'span.html-span.xkrqix3.x1sur9pj:has-text("views")',
                                    'span.html-span:has-text("views")',
                                    // Tertiary: Broader search
                                    'span.x193iq5w.xeuugli:has-text("views")',
                                    'span.x193iq5w:has-text("views")',
                                    'span:has-text("views")',
                                    'div:has-text("views")',
                                ];
                                
                                for (const selector of viewsSelectors) {
                                    const viewSpans = await page.locator(selector).all();
                                    
                                    for (const span of viewSpans) {
                                        const text = await span.textContent();
                                        
                                        if (text && text.toLowerCase().includes('view')) {
                                            // Pattern: "2.4M views" or "38K views" or "500 views"
                                            const match = text.match(/(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)\s*views?/i);
                                            
                                            if (match) {
                                                views = parseEngagementCount(match[1]);
                                                
                                                if (views > 0) {
                                                    console.log(`         ✅ Views extracted: ${views} (${match[0]})`);
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    
                                    if (views > 0) break;
                                }
                                
                                // Strategy 2: Search all text content (fallback)
                                if (views === 0) {
                                    console.log(`         -> Trying fallback: all text search...`);
                                    
                                    const allTexts = await page.locator('span, div').allTextContents();
                                    
                                    for (const text of allTexts) {
                                        if (!text) continue;
                                        
                                        const match = text.match(/(\d+[\d,.]*(K|k|M|m|rb|Rb|jt|Jt)?)\s*views?/i);
                                        if (match) {
                                            views = parseEngagementCount(match[1]);
                                            if (views > 0) {
                                                console.log(`         ✅ Views extracted (fallback): ${views} (${text.trim()})`);
                                                break;
                                            }
                                        }
                                    }
                                }
                                
                            } catch (e) {
                                console.warn(`         ⚠️ Views extraction error: ${e.message.substring(0, 40)}`);
                            }

                            // ========== VALIDATION - ENHANCED ==========
                            // ✅ Check: Jangan update kalau old > 0 tapi new = 0 (extraction failed)
                            const extractionFailed = oldViews > 0 && views === 0;

                            if (views === 0 || extractionFailed) {
                                if (extractionFailed) {
                                    console.log(`         ⚠️ Extraction failed: ${oldViews} → 0 ❌ (keeping old: ${oldViews})`);
                                } else {
                                    console.log(`         ⚠️ Views not found - keeping old value (${oldViews})`);
                                }
                                
                                skippedCount++;
                                
                                // ✅ DEBUG: Save screenshot untuk analisis
                                if (CONFIG.SCREENSHOT_ON_ERROR) {
                                    const filename = await captureErrorScreenshot(page, 'no_views', i + 1);
                                    if (filename) {
                                        console.log(`         📸 Screenshot: ${filename}`);
                                    }
                                }
                                
                                continue;  // ✅ SKIP, jangan update!
                            }

                            // ========== UPDATE POST DATA ==========
                            const deltaV = views - oldViews;
                            const formatDelta = (delta) => delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0';

                            post.views = views;
                            post.updated_at = new Date().toISOString();
                            
                            updatedCount++;
                            
                            console.log(`         ✅ V:${views} (${formatDelta(deltaV)})`);

                            // ✅ Human-like delay (3-5 detik)
                            await page.waitForTimeout(3000 + Math.random() * 2000);
                            
                        } catch (error) {
                            console.warn(`         ⚠️ Error processing video: ${error.message.substring(0, 50)}`);
                            skippedCount++;
                            
                            // Screenshot on error
                            if (CONFIG.SCREENSHOT_ON_ERROR) {
                                await captureErrorScreenshot(page, 'update_views', i + 1);
                            }
                        }
                    }

                    // ========== SAVE UPDATED DATA ==========
                    if (updatedCount > 0) {
                        console.log(`\n      💾 Saving ${updatedCount} updated posts...`);
                        
                        const writer = createObjectCsvWriter({
                            path: csvFile,
                            header: Object.keys(posts[0]).map(id => ({id, title: id})),
                            alwaysQuote: true,
                            encoding: 'utf8'
                        });
                        
                        await writer.writeRecords(posts);
                        
                        // Set file permissions
                        fs.chmodSync(csvFile, CONFIG.FILE_PERMISSIONS);
                        
                        console.log(`      ✅ ${updatedCount} video views updated in ${csvFile}`);
                        
                        log('INFO', 'Video views updated', {
                            file: csvFile,
                            updated: updatedCount,
                            skipped: skippedCount
                        });
                    }
                    
                    console.log(`      ℹ️ Skipped: ${skippedCount} videos (no views found or error)`);

                    resolve();
                });
        });
    }
    
    console.log(`\n✅ Update video views completed!`);
}


/**
 * Main job runner
 */
async function runJob() {
    if (isJobRunning) {
        console.log(`\n🏃 Job sebelumnya masih berjalan. Skip...`);
        return;
    }
    isJobRunning = true;

    log('INFO', 'Job started', { 
        cycle: stats.cycleCount + 1,
        isFirstRun: !isFirstRunDone 
    });
    
    let totalScraped = 0;
    let totalErrors = 0;
    
    console.log(`\n${"=".repeat(70)}`);
    console.log(`🚀 [${new Date().toLocaleString('id-ID')}] MEMULAI SIKLUS SCRAPING`);
    console.log(`${"=".repeat(70)}`);
    
    const userDataDir = path.join(os.homedir(), 'playwright_fb_session');
    
    let context;
    try {
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'chrome',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            permissions: ['clipboard-read', 'clipboard-write'],
            viewport: null, // ✅ Set to null to use full screen size
            args: [
                '--disable-blink-features=AutomationControlled',
                '--enable-clipboard-read-write',
                '--start-maximized' // ✅ Start browser in fullscreen/maximized mode
            ]
        });
        
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { 
            origin: 'https://www.facebook.com' 
        });

        const page = await context.newPage();
        console.log("🖥️  Browser window set to fullscreen/maximized mode");

        await page.goto("https://www.facebook.com/", { waitUntil: 'domcontentloaded' });

        // ✅ Set zoom level untuk timestamp dan layout
        await setPageZoom(page);

        let loginSuccess;
        try {
            await page.waitForSelector('a[aria-label="Home"]', { timeout: 5000 });
            console.log("🎉 Login sudah ada (dari sesi sebelumnya).");
            loginSuccess = true;
        } catch (e) {
            console.log("ℹ️ Belum login. Memulai proses login...");
            loginSuccess = await loginToFacebook(page, CONFIG.fb_username, CONFIG.fb_password);
        }

        if (!loginSuccess) {
            console.error("❌ Login gagal. Scraping dibatalkan.");
            isJobRunning = false;
            if (context) await context.close();
            return;
        }

        console.log("✅ Login sukses. Memulai scraping...\n");

        let totalScraped = 0;

        // ✅ RESUME: Start from last position
        const startQueryIndex = resumeState.currentQueryIndex || 0;
        if (startQueryIndex > 0) {
            console.log(`🔄 RESUMING from Query ${startQueryIndex + 1}/${CONFIG.query_variations.length}\n`);
        }

        for (let i = startQueryIndex; i < CONFIG.query_variations.length; i++) {
            // ✅ UPDATE PROGRESS STATE
            resumeState.currentQueryIndex = i;
            resumeState.lastSavedAt = new Date().toISOString();

            const currentQuery = CONFIG.query_variations[i];
            console.log(`\n${"━".repeat(70)}`);
            console.log(`🎯 Query ${i + 1}/${CONFIG.query_variations.length}: "${currentQuery}"`);
            console.log(`${"━".repeat(70)}`);
            
            const queryPage = await context.newPage();

            try {
                const searchUrl = `https://www.facebook.com/search/posts/?q=${encodeURIComponent(currentQuery)}`;
                await queryPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

                // ✅ Set zoom level
                await setPageZoom(queryPage);

                await queryPage.waitForTimeout(3000);
                
                // ========== SCRAPE HISTORICAL DATA (HANYA FIRST RUN) ==========
                if (!isFirstRunDone && CONFIG.USE_DATE_FILTER && CONFIG.FILTER_YEARS.length > 0) {
                    console.log(`📚 MODE: Scraping historical data (${CONFIG.FILTER_YEARS.join(', ')})`);

                    // ✅ RESUME: Update mode
                    resumeState.inHistoricalMode = true;

                    // ✅ RESUME: Start from last year index
                    const startYearIndex = resumeState.currentYearIndex || 0;
                    if (startYearIndex > 0) {
                        console.log(`🔄 Resuming from year index ${startYearIndex + 1}/${CONFIG.FILTER_YEARS.length}`);
                    }

                    for (let yearIndex = startYearIndex; yearIndex < CONFIG.FILTER_YEARS.length; yearIndex++) {
                        // ✅ UPDATE YEAR INDEX
                        resumeState.currentYearIndex = yearIndex;

                        const year = CONFIG.FILTER_YEARS[yearIndex];
                        console.log(`\n📅 Processing year: ${year}`);

                        if (yearIndex > 0) {
                            await clearDateFilter(queryPage);
                            await humanDelay(2000, 3000);
                        }

                        await clickAllTab(queryPage);
                        await humanDelay(1500, 2500);

                        const scraped = await scrapeFacebookSearch(queryPage, currentQuery, CONFIG.max_posts_historical, year);
                        totalScraped += scraped;

                        // ✅ SAVE PROGRESS after each year
                        saveProgress();

                        if (yearIndex < CONFIG.FILTER_YEARS.length - 1) {
                            await humanDelay(3000, 5000);
                        }
                    }

                    // ✅ RESET year index after historical done
                    resumeState.currentYearIndex = 0;
                    resumeState.inHistoricalMode = false;
                    
                    console.log(`\n🧹 Clearing last year filter...`);
                    await clearDateFilter(queryPage);
                    await humanDelay(2000, 3000);
                } else if (isFirstRunDone) {
                    console.log(`ℹ️  Historical data sudah di-scrape sebelumnya, skip...`);
                }
                
                // ========== SCRAPE RECENT POSTS (ALWAYS RUN) ==========
                console.log(`\n📰 MODE: Scraping RECENT POSTS (real-time updates)`);

                // ✅ RESET historical mode flag
                resumeState.inHistoricalMode = false;

                await enableRecentPosts(queryPage);
                await humanDelay(2000, 3000);

                const recentScraped = await scrapeFacebookSearch(queryPage, currentQuery, CONFIG.max_posts_recent, null);
                totalScraped += recentScraped;

                // ✅ NEW: Update recent posts engagement immediately after scraping
                if (CONFIG.UPDATE_RECENT_POSTS && recentScraped > 0) {
                    console.log(`\n🔄 Starting update for ${recentScraped} recent posts...`);

                    try {
                        const updateResult = await updateRecentPostsEngagement(queryPage, recentScraped);
                        console.log(`✅ Update complete: ${updateResult.updated} updated, ${updateResult.failed} failed, ${updateResult.skipped} skipped\n`);
                    } catch (updateError) {
                        console.error(`❌ Update error: ${updateError.message}`);
                    }
                }

                // ✅ SAVE PROGRESS after query complete
                saveProgress();

            } catch (pageError) {
                console.error(`❌ Error di query "${currentQuery}": ${pageError.message}`);
            } finally {
                if (!queryPage.isClosed()) {
                    await queryPage.close();
                }
            }

            if (i < CONFIG.query_variations.length - 1) {
                const jeda = CONFIG.JEDA_ANTAR_QUERY_MENIT * 60 * 1000;
                console.log(`\n😴 Jeda ${CONFIG.JEDA_ANTAR_QUERY_MENIT} menit...`);
                await new Promise(resolve => setTimeout(resolve, jeda));
            }
        }

        // ✅ CLEAR PROGRESS after all queries complete
        console.log(`\n🗑️  Clearing resume state (all queries completed)...`);
        clearProgress();

        if (!isFirstRunDone) {
            isFirstRunDone = true;
            fs.writeFileSync(CONFIG.FIRST_RUN_FILE, new Date().toISOString());
            console.log(`\n✅ First run completed! Historical data collection done.`);
            console.log(`   Future runs akan hanya scrape RECENT posts.`);
        }
        
        console.log(`\n${"=".repeat(70)}`);
        console.log(`🎉 SCRAPING SELESAI - Total: ${totalScraped} posts baru`);
        console.log(`${"=".repeat(70)}`);
        // ✅ NEW: Update statistics
        updateStats(totalScraped, totalErrors);

        // ✅ Save strategy report setiap cycle
        saveStrategyReport();
        console.log("📊 Strategy report updated!\n");

        console.log("\n🔄 Memulai update engagement...");
        const updatePage = await context.newPage();

        // ✅ Set zoom level
        await setPageZoom(updatePage);

        try {
            // Update engagement (selalu jalan)
            await updateEngagement(updatePage, CONFIG.UPDATE_BATCH_SIZE);
            
            // ✅ NEW: Update video views (LESS FREQUENT - setiap 3 siklus sekali)
            // Ini untuk menghindari terlalu aggressive dan takut kena rate limit
            if (stats.cycleCount % 3 === 0) {
                console.log("\n🎬 Memulai update video views...");
                // Batch size lebih kecil (setengah dari engagement) untuk lebih aman
                await updateVideoViews(updatePage, Math.floor(CONFIG.UPDATE_BATCH_SIZE / 2));
            } else {
                console.log(`\n⏭️  Skipping video views update this cycle (will update every 3rd cycle, next in ${3 - (stats.cycleCount % 3)} cycle(s))`);
            }
            
        } catch (updateError) {
            console.error(`❌ Error update: ${updateError.message}`);
            log('ERROR', 'Update error', { error: updateError.message });
        } finally {
            await updatePage.close();
        }

    } catch (error) {
        console.error("❌ Error fatal:", error);
        log('ERROR', 'Fatal error in runJob', { 
            error: error.message,
            stack: error.stack?.substring(0, 500)
        });
        totalErrors++;
        stats.lastErrorTime = new Date().toISOString();
    } finally {
        if (context) {
            await context.close();
        }
        console.log("✅ Browser ditutup.\n");
        isJobRunning = false;
    }
}

/**
 * ✅ FULL EXTRACTION: Process Orphan URLs - Complete Re-scraping
 */
async function processOrphanURLs(context, maxToProcess = 50) {
    console.log('\n🔍 ORPHAN URL PROCESSOR - Full Re-extraction (All Strategies)\n');
    
    try {
        // ========== STEP 1: Load URLs dari CSV ==========
        console.log('📂 Loading URLs from CSV files...');
        const csvUrls = new Set();
        const csvFiles = [
            ...CONFIG.FILTER_YEARS.map(y => getCSVFilename(y)),
            getCSVFilename(null)
        ].filter(f => fs.existsSync(f));
        
        for (const csvFile of csvFiles) {
            await new Promise((resolve) => {
                fs.createReadStream(csvFile)
                    .pipe(csvParser())
                    .on('data', (row) => {
                        if (row.post_url && row.post_url !== 'N/A') csvUrls.add(row.post_url);
                        if (row.share_url && row.share_url !== 'N/A') csvUrls.add(row.share_url);
                    })
                    .on('end', resolve);
            });
        }
        
        console.log(`📊 URLs in CSV: ${csvUrls.size}, Cache: ${allScrapedUrls.size}\n`);
        
        // ========== STEP 2: Find Orphan URLs ==========
        const orphanUrls = [];
        
        for (const cacheEntry of allScrapedUrls) {
            // Skip internal keys
            if (cacheEntry.startsWith('postid:') || 
                cacheEntry.startsWith('photoid:') || 
                cacheEntry.startsWith('hash:')) {
                continue;
            }
            
            // Only Facebook URLs
            if (cacheEntry.includes('facebook.com')) {
                if (!csvUrls.has(cacheEntry)) {
                    orphanUrls.push(cacheEntry);
                }
            }
        }
        
        console.log(`📍 Found ${orphanUrls.length} orphan URLs`);
        
        if (orphanUrls.length === 0) {
            console.log('✅ No orphan URLs!\n');
            return { processed: 0, succeeded: 0, failed: 0, remaining: 0 };
        }
        
        const urlsToProcess = orphanUrls.slice(0, maxToProcess);
        console.log(`-> Processing: ${urlsToProcess.length} URLs (full extraction)\n`);
        
        let succeeded = 0, failed = 0;
        const extractedPosts = [];
        
        // ========== STEP 3: Process Each URL (FULL EXTRACTION) ==========
        for (let i = 0; i < urlsToProcess.length; i++) {
            const url = urlsToProcess[i];
            let page = null;
            
            try {
                console.log(`\n[${i + 1}/${urlsToProcess.length}] 🔄 ${url.substring(0, 70)}...`);
                
                await checkRateLimit();
                
                // ✅ Open URL
                page = await context.newPage();
                const gotoResult = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                }).catch((err) => {
                    console.log(`         ⚠️ Load error: ${err.message.substring(0, 40)}`);
                    return null;
                });

                // ✅ Set zoom level
                if (gotoResult) {
                    await setPageZoom(page);
                }
                
                if (!gotoResult) {
                    console.log(`         ❌ Failed to load`);
                    
                    // ✅ Screenshot error
                    if (CONFIG.SCREENSHOT_ON_ERROR) {
                        await captureErrorScreenshot(page, 'orphan_load_failed', i + 1);
                    }
                    
                    failed++;
                    allScrapedUrls.delete(url);
                    continue;
                }
                
                await page.waitForTimeout(4000);
                await page.waitForSelector('div[role="main"]', { timeout: 10000 }).catch(() => {});
                await page.waitForTimeout(2000);
                
                const postEl = page.locator('div[role="main"]').first();
                
                // ========== FULL EXTRACTION (sama seperti scrapeFacebookSearch) ==========
                
                let authorName = "N/A";
                let postTimestamp = "N/A";
                let shareUrl = "N/A";
                let contentText = "";
                let imageUrl = "N/A";
                let videoUrl = "N/A";
                let actualImageUrl = "N/A";
                let actualVideoUrl = "N/A";
                let location = "N/A";
                
                // ========== EXTRACT AUTHOR (FULL STRATEGY) ==========
                try {
                    // Strategy 0: REEL author
                    const reelAuthorEl = postEl.locator('h2.html-h2 a[aria-label*="See owner profile"]').first();
                    if (await reelAuthorEl.count() > 0) {
                        const text = await reelAuthorEl.textContent();
                        if (text?.trim()) {
                            authorName = cleanTextForCSV(text.trim());
                            console.log(`      -> Author (reel): ${authorName}`);
                            trackStrategy('author', 'reel_h2_profile_link');
                        }
                    }
                    
                    // Strategy 1a: "X is with Y"
                    if (authorName === "N/A") {
                        const withContainer = postEl.locator('h3:has-text(" is with "), h2:has-text(" is with ")').first();
                        
                        if (await withContainer.count() > 0) {
                            const authorLinks = await withContainer.locator('b a[role="link"]').all();
                            const authorNames = [];
                            
                            for (const link of authorLinks) {
                                const href = await link.getAttribute('href');
                                if (href && !href.includes('/pages/')) {
                                    const name = await link.innerText().catch(() => '');
                                    if (name?.trim()) {
                                        authorNames.push(cleanTextForCSV(name.trim()));
                                    }
                                }
                            }
                            
                            // Check "X others" button
                            const othersButton = withContainer.locator('div[role="button"]:has-text("others")').first();
                            if (await othersButton.count() > 0) {
                                try {
                                    await othersButton.scrollIntoViewIfNeeded().catch(() => {});
                                    await page.waitForTimeout(500);
                                    await othersButton.hover({ timeout: 3000 });
                                    await page.waitForTimeout(2000);
                                    
                                    const tooltip = page.locator('div[role="tooltip"]:visible').first();
                                    if (await tooltip.count() > 0) {
                                        const tooltipText = await tooltip.textContent();
                                        if (tooltipText) {
                                            const hiddenAuthors = tooltipText
                                                .split(/,|\n/)
                                                .map(n => n.trim())
                                                .filter(n => n && n.length > 0)
                                                .map(n => cleanTextForCSV(n));
                                            
                                            if (hiddenAuthors.length > 0) {
                                                authorNames.push(...hiddenAuthors);
                                            }
                                        }
                                    }
                                    await page.mouse.move(0, 0).catch(() => {});
                                } catch (e) {}
                            }
                            
                            if (authorNames.length > 0) {
                                authorName = authorNames.join(' with ');
                                console.log(`      -> Authors (is with): ${authorName}`);
                                trackStrategy('author', 'is_with_pattern');
                            }
                        }
                    }
                    
                    // Strategy 2: Single author (fallback)
                    if (authorName === "N/A") {
                        const authorEl = await postEl.locator('h3 a, h2 a strong, h4 a strong').first();
                        if (await authorEl.count() > 0) {
                            const text = await authorEl.innerText();
                            if (text?.trim()) {
                                authorName = cleanTextForCSV(text.trim());
                                console.log(`      -> Author: ${authorName}`);
                                trackStrategy('author', 'single_author_fallback');
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`      ⚠️ Author extraction error: ${e.message.substring(0, 40)}`);
                }
                
                // ========== EXTRACT TIMESTAMP (FULL STRATEGY) ==========
                try {
                    const timestampLinkEl = await postEl.locator(
                        'a[role="link"][attributionsrc], a[href*="/posts/"], a[href*="/photo"], a[href*="/reel/"]'
                    ).first();
                    
                    if (await timestampLinkEl.count() > 0) {
                        postTimestamp = await extractTimestamp(postEl, timestampLinkEl, page);
                        console.log(`      -> Timestamp: ${postTimestamp}`);
                    }
                } catch (e) {
                    console.warn(`      ⚠️ Timestamp extraction error: ${e.message.substring(0, 40)}`);
                }
                
                // ✅ VALIDATION: Timestamp harus valid
                if (!isValidTimestamp(postTimestamp)) {
                    console.log(`      ❌ Invalid timestamp, skipping`);
                    
                    // Screenshot untuk analisis
                    if (CONFIG.SCREENSHOT_ON_ERROR) {
                        await captureErrorScreenshot(page, 'orphan_invalid_timestamp', i + 1);
                    }
                    
                    failed++;
                    allScrapedUrls.delete(url);
                    continue;
                }
                
                // ========== EXTRACT LOCATION ==========
                location = await extractLocation(postEl);
                
                // ========== EXPAND "SEE MORE" (jika ada) ==========
                const seeMoreSelectors = [
                    'object[type="nested/pressable"] div[role="button"]:has-text("See more")',
                    'div[role="button"]:has-text("See more")',
                    'div.xkrqix3.x1sur9pj:has-text("See more")'
                ];
                
                for (const selector of seeMoreSelectors) {
                    const seeMoreButton = postEl.locator(selector).first();
                    if (await seeMoreButton.count() > 0) {
                        try {
                            await seeMoreButton.scrollIntoViewIfNeeded().catch(() => {});
                            await page.waitForTimeout(500);
                            await seeMoreButton.click({ timeout: 3000 });
                            await page.waitForTimeout(2000);
                            console.log(`      -> Expanded 'See more'`);
                            break;
                        } catch (e) {}
                    }
                }
                
                // ========== HANDLE TRANSLATION (jika ada) ==========
                const translationHandled = await handleTranslatedContent(page, postEl);
                if (translationHandled) {
                    console.log(`      -> Translation handled`);
                }
                
                // ========== EXTRACT CONTENT (prioritas Indonesian) ==========
                const indonesianSelectors = [
                    'span[dir="auto"][lang="id-ID"] div[dir="auto"]',
                    'div[data-ad-preview="message"] span[lang="id-ID"] div'
                ];
                
                for (const selector of indonesianSelectors) {
                    const contentDivs = await postEl.locator(selector).all();
                    if (contentDivs.length > 0) {
                        const paragraphs = [];
                        for (const div of contentDivs) {
                            const text = await div.textContent() || '';
                            if (text.trim()) paragraphs.push(text.trim());
                        }
                        if (paragraphs.length > 0) {
                            contentText = cleanTextForCSV(paragraphs.join(' '));
                            console.log(`      -> Text (Indonesian): ${contentText.substring(0, 50)}...`);
                            trackStrategy('content', 'indonesian_lang_selector');
                            break;
                        }
                    }
                }
                
                // Fallback to regular content
                if (!contentText) {
                    const textSelectors = [
                        'div[data-ad-preview="message"] span[dir="auto"]',
                        'div.x11i5rnm.xat24cr span[dir="auto"]',
                        'div.xdj266r.x14z9mp.xat24cr span'
                    ];
                    
                    for (const selector of textSelectors) {
                        const textEl = await postEl.locator(selector).first();
                        if (await textEl.count() > 0) {
                            const text = await textEl.textContent();
                            if (text?.trim()) {
                                contentText = cleanTextForCSV(text.trim());
                                console.log(`      -> Text: ${contentText.substring(0, 50)}...`);
                                trackStrategy('content', 'regular_post_selector');
                                break;
                            }
                        }
                    }
                }
                
                // ========== IMAGE/VIDEO DETECTION ==========
                if (url.includes('/reel/') || url.includes('/videos/')) {
                    videoUrl = url;
                    console.log(`      -> Has video (from URL)`);
                    
                    // Try extract video source
                    try {
                        const videoEl = await postEl.locator('video').first();
                        if (await videoEl.count() > 0) {
                            actualVideoUrl = await videoEl.getAttribute('src');
                            if (!actualVideoUrl) {
                                const sourceEl = await postEl.locator('video source').first();
                                if (await sourceEl.count() > 0) {
                                    actualVideoUrl = await sourceEl.getAttribute('src');
                                }
                            }
                            if (actualVideoUrl && actualVideoUrl !== "N/A") {
                                console.log(`      -> Video source: ${actualVideoUrl.substring(0, 50)}...`);
                            }
                        }
                    } catch (e) {}
                    
                } else if (url.includes('/photo')) {
                    imageUrl = url;
                    console.log(`      -> Has image (from URL)`);
                    
                    // Try extract image source
                    try {
                        const imgElements = await postEl.locator('img[src^="https"]').all();
                        for (const img of imgElements) {
                            const src = await img.getAttribute('src');
                            const width = await img.evaluate(el => el.naturalWidth || el.width).catch(() => 0);
                            
                            if (src && width > 200 && src.includes('scontent')) {
                                actualImageUrl = src;
                                console.log(`      -> Image source: ${actualImageUrl.substring(0, 50)}...`);
                                break;
                            }
                        }
                    } catch (e) {}
                }
                
                // ========== EXTRACT ENGAGEMENT (ALL STRATEGIES) ==========
                console.log(`      -> Extracting engagement...`);
                
                let reactions_total = await extractReactions(postEl, page, i + 1, true); // ✅ Enable screenshot
                let comments = await extractComments(postEl, page, i + 1, true);
                let shares = await extractShares(postEl, page, i + 1, true);
                
                // ✅ Special handling untuk REEL (buka page jika engagement = 0)
                const isReel = url.includes('/reel/');
                const hasNoEngagement = reactions_total === 0 && comments === 0 && shares === 0;
                
                if (isReel && hasNoEngagement) {
                    console.log(`      -> Reel with no engagement, opening reel page...`);
                    const reelEngagement = await extractReelEngagementFromPage(context, url);
                    reactions_total = reelEngagement.reactions;
                    comments = reelEngagement.comments;
                    shares = reelEngagement.shares;
                    console.log(`      -> R:${reactions_total} C:${comments} S:${shares} (from reel page)`);
                } else {
                    console.log(`      -> R:${reactions_total} C:${comments} S:${shares}`);
                }
                
                // ========== EXTRACT VIEWS (untuk video, buka new tab) ==========
                let views = 0;
                if (videoUrl !== "N/A") {
                    views = await extractViews(postEl);
                    
                    if (views === 0) {
                        console.log(`      -> Views not found, opening video page...`);
                        views = await extractVideoViewsFromPage(context, videoUrl);
                    }
                    
                    if (views > 0) {
                        console.log(`      -> Views: ${views}`);
                    }
                }
                
                // ========== EXTRACT SHARE URL (jangan skip!) ==========
                console.log(`      -> Getting share URL...`);
                shareUrl = await extractShareUrl(page, postEl);
                if (shareUrl !== "N/A") {
                    console.log(`      ✅ Share URL: ${shareUrl.substring(0, 60)}...`);
                } else {
                    console.log(`      -> Could not get share URL`);
                }
                
                // ========== DETERMINE YEAR ==========
                let filterYear = 'recent_mode';
                const timestampISO = convertToISO(postTimestamp);
                
                if (timestampISO) {
                    const year = new Date(timestampISO).getFullYear();
                    if (CONFIG.FILTER_YEARS.includes(year)) {
                        filterYear = year;
                    }
                    console.log(`      -> Year: ${year} -> ${filterYear === 'recent_mode' ? 'recent_posts.csv' : `posts_${filterYear}.csv`}`);
                }
                
                // ========== CREATE POST OBJECT ==========
                const post = {
                    author: authorName,
                    author_url: 'N/A',
                    author_followers: 0,
                    location: location,
                    timestamp: postTimestamp,
                    timestamp_iso: timestampISO,
                    post_url: url,
                    share_url: shareUrl,
                    content_text: contentText,
                    image_url: imageUrl,
                    video_url: videoUrl,
                    image_source: actualImageUrl,
                    video_source: actualVideoUrl,
                    reactions_total,
                    comments,
                    shares,
                    views,
                    query_used: "orphan_recovery",
                    filter_year: filterYear,
                    scraped_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                extractedPosts.push({ post, filterYear });
                succeeded++;
                
                console.log(`      ✅ Extraction complete!\n`);
                
                // Remove dari cache
                allScrapedUrls.delete(url);
                
                // Delay
                await page.waitForTimeout(3000 + Math.random() * 2000);
                
            } catch (error) {
                failed++;
                console.warn(`      ❌ Fatal error: ${error.message.substring(0, 60)}`);
                
                // ✅ SCREENSHOT ERROR
                if (CONFIG.SCREENSHOT_ON_ERROR && page && !page.isClosed()) {
                    await captureErrorScreenshot(page, 'orphan_extraction_failed', i + 1);
                }
                
                // Remove URL yang error
                allScrapedUrls.delete(url);
                
            } finally {
                // ALWAYS close page
                if (page && !page.isClosed()) {
                    await page.close().catch(() => {});
                }
            }
        }
        
        // ========== SAVE TO CSV ==========
        if (extractedPosts.length > 0) {
            console.log(`\n💾 Saving ${extractedPosts.length} posts...\n`);
            
            const postsByYear = {};
            for (const { post, filterYear } of extractedPosts) {
                if (!postsByYear[filterYear]) postsByYear[filterYear] = [];
                postsByYear[filterYear].push(post);
            }
            
            for (const [year, posts] of Object.entries(postsByYear)) {
                const csvFile = getCSVFilename(year === 'recent_mode' ? null : parseInt(year));
                console.log(`   📁 ${path.basename(csvFile)}: ${posts.length} posts`);
                await saveData(posts, csvFile);
            }
            
            console.log(`\n   ✅ All saved!\n`);
        }
        
        // ========== SUMMARY ==========
        console.log(`📊 SUMMARY:`);
        console.log(`   • Processed: ${urlsToProcess.length}`);
        console.log(`   • Succeeded: ${succeeded}`);
        console.log(`   • Failed: ${failed}`);
        console.log(`   • Remaining: ${orphanUrls.length - urlsToProcess.length}\n`);
        
        return { 
            processed: urlsToProcess.length, 
            succeeded, 
            failed,
            remaining: orphanUrls.length - urlsToProcess.length
        };
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        return { processed: 0, succeeded: 0, failed: 0, remaining: 0 };
    }
}

/**
 * Main loop
 */
async function main() {
    console.log("\n");
    console.log("╔═══════════════════════════════════════════════════════════════════╗");
    console.log("║   🤖 FACEBOOK AUTO SCRAPER v7.0 - MULTI CSV + ENHANCED        ║");
    console.log("╠═══════════════════════════════════════════════════════════════════╣");
    console.log(`║  Target Queries: ${CONFIG.query_variations.length}                                                 ║`);
    console.log(`║  Historical Posts/Query: ${CONFIG.max_posts_historical}                                       ║`);
    console.log(`║  Recent Posts/Query: ${CONFIG.max_posts_recent}                                       ║`);
    console.log(`║  Filter Years: ${CONFIG.FILTER_YEARS.join(', ')}                                      ║`);
    console.log(`║  CSV Folder: ${CONFIG.csv_base_folder}                                    ║`);
    console.log(`║  DEBUG MODE: ${CONFIG.DEBUG_MODE ? 'ON ✅' : 'OFF'}                                          ║`);
    console.log("╚═══════════════════════════════════════════════════════════════════╝");
    console.log();

    // ✅ LOAD RESUME STATE
    loadProgress();

    if (fs.existsSync(CONFIG.FIRST_RUN_FILE)) {
        isFirstRunDone = true;
        const timestamp = fs.readFileSync(CONFIG.FIRST_RUN_FILE, 'utf8');
        console.log(`✅ First run was completed at: ${timestamp}`);
        console.log(`   Skipping historical data, will only scrape RECENT posts.\n`);
    }

    // Load existing URLs from ALL CSV files (if cache not loaded)
    const allCsvFiles = [
        ...CONFIG.FILTER_YEARS.map(y => getCSVFilename(y)),
        getCSVFilename(null)
    ].filter(f => fs.existsSync(f));

    for (const csvFile of allCsvFiles) {
        await new Promise((resolve) => {
            fs.createReadStream(csvFile)
                .pipe(csvParser())
                .on('data', (row) => {
                    if (row.post_url) allScrapedUrls.add(row.post_url);
                })
                .on('end', () => {
                    console.log(`📂 Loaded URLs from: ${csvFile}`);
                    resolve();
                });
        });
    }
    
    console.log(`📊 Total existing URLs loaded: ${allScrapedUrls.size}\n`);

    // ✅ NEW: Setup periodic backup timer
    if (CONFIG.BACKUP_ENABLED) {
        setInterval(() => {
            createBackup();
        }, CONFIG.BACKUP_INTERVAL_HOURS * 60 * 60 * 1000);
        
        log('INFO', 'Backup timer started', { 
            interval: `${CONFIG.BACKUP_INTERVAL_HOURS} hours` 
        });
    }
    
    // ✅ NEW: Setup stats save timer
    setInterval(() => {
        saveStats();
    }, 5 * 60 * 1000); // Save stats every 5 minutes
    
    // ✅ MODIFIED: Main loop with retry
    while (true) {
        const success = await runJobWithRetry();  
        
        if (success) {
            log('INFO', 'Cycle completed successfully', {
                totalScraped: stats.totalScraped,
                cycleCount: stats.cycleCount
            });
        } else {
            log('ERROR', 'Cycle failed after retries', {
                cycleCount: stats.cycleCount
            });
        }
        
        // ✅ TAMBAHAN BARU: Process orphan URLs
        try {
            console.log('\n🔄 Processing orphan URLs...');
            
            const userDataDir = path.join(os.homedir(), 'playwright_fb_session');
            const orphanContext = await chromium.launchPersistentContext(userDataDir, {
                headless: false,
                channel: 'chrome',
                viewport: { width: 1920, height: 1080 }
            });
            
            const result = await processOrphanURLs(orphanContext, 50);
            await orphanContext.close();
            
            if (result.processed > 0) {
                console.log(`✅ Orphan done: ${result.succeeded}/${result.processed}`);
            }
        } catch (err) {
            console.error(`❌ Orphan error: ${err.message}`);
        }
        
        const jedaSiklus = CONFIG.JEDA_ANTAR_SIKLUS_MENIT * 60 * 1000;
        console.log(`${"─".repeat(70)}`);
        console.log(`😴 Siklus selesai. Jeda ${CONFIG.JEDA_ANTAR_SIKLUS_MENIT} menit...`);
        console.log(`   Stats: ${stats.totalScraped} total, ${stats.cycleCount} cycles`);
        console.log(`${"─".repeat(70)}\n`);

        // ✅ AUTO-IMPORT ke Database
        if (isApiAvailable) {
            try {
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('📥 AUTO-IMPORT: Triggering database import...');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

                const importResponse = await axios.post(
                    `${CONFIG.API_BASE_URL}/api/import`,
                    {},
                    {
                        timeout: 60000, // 60 seconds for import
                        family: 4 // Force IPv4
                    }
                );

                console.log('   ✅ Import completed successfully!');
                console.log('\n📊 Dashboard will auto-refresh in 30 seconds');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            } catch (err) {
                console.log(`   ⚠️  Auto-import failed: ${err.message}`);
                console.log(`   💡 TIP: Make sure Docker containers are running (docker-compose up -d)`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            }
        } else {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('⚠️  AUTO-IMPORT SKIPPED: API not available');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('   💡 Run manually: docker exec facebook-api node import.js');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        }

        await new Promise(resolve => setTimeout(resolve, jedaSiklus));
    }
}  // ✅ Closing bracket main() tetap ada

// ✅ MODIFIED: Graceful shutdown with cleanup + RESUME STATE
process.on('SIGINT', async () => {
    console.log("\n\n⚠️ Shutdown signal received. Cleaning up...");

    log('WARN', 'Graceful shutdown initiated');

    // ✅ Save progress for resume
    console.log("💾 Saving progress for resume...");
    saveProgress();

    // Save stats
    console.log("📊 Saving statistics...");
    saveStats();

    // ✅ Save final strategy report
    console.log("📊 Saving final strategy report...");
    saveStrategyReport();

    // Final backup
    if (CONFIG.BACKUP_ENABLED) {
        console.log("💾 Creating final backup...");
        await createBackup();
    }

    log('INFO', 'Shutdown complete');
    console.log("✅ Cleanup complete. Goodbye!\n");
    console.log("💡 TIP: Run the script again to resume from this position!\n");

    process.exit(0);
});

// ✅ NEW: Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error("\n💥 Uncaught Exception:", error);
    log('ERROR', 'Uncaught exception', {
        error: error.message,
        stack: error.stack
    });

    // Save state before crash
    console.log("💾 Saving state before crash...");
    saveProgress();
    saveStats();

    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error("\n💥 Unhandled Rejection at:", promise, "reason:", reason);
    log('ERROR', 'Unhandled rejection', {
        reason: String(reason)
    });
});

main().catch(err => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
});