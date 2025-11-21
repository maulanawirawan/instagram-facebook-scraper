#!/usr/bin/env node
/**
 * AUTO-SETUP DATABASE
 * - Creates user 'fbadmin' if not exists
 * - Creates database 'facebook_data' if not exists
 * - Creates all tables, views, functions
 * - NO NEED TO RECREATE CONTAINERS!
 *
 * Usage: node auto-setup-database.js
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔧 Auto-Setup Database (NO RECREATE NEEDED)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

async function setupDatabase() {
    let client;

    try {
        // STEP 1: Connect as postgres superuser (try with POSTGRES_USER first)
        console.log('📡 Step 1: Connecting to PostgreSQL...');

        // Try connecting with POSTGRES_USER (which might be 'fbadmin' or 'postgres')
        const superuser = process.env.POSTGRES_USER || 'postgres';
        const superpassword = process.env.POSTGRES_PASSWORD || 'fbpass123';

        client = new Client({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            user: superuser,
            password: superpassword,
            database: 'postgres',  // Default database
            connectionTimeoutMillis: 5000,
        });

        await client.connect();
        console.log(`✅ Connected as "${superuser}"\n`);

        // STEP 2: Create role 'fbadmin' if not exists
        console.log('👤 Step 2: Creating role "fbadmin"...');
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'fbadmin') THEN
                    CREATE ROLE fbadmin WITH LOGIN PASSWORD 'fbpass123';
                    ALTER ROLE fbadmin CREATEDB;
                    RAISE NOTICE 'Role fbadmin created';
                ELSE
                    RAISE NOTICE 'Role fbadmin already exists';
                END IF;
            END
            $$;
        `);
        console.log('✅ Role "fbadmin" ready\n');

        // STEP 3: Create database 'facebook_data' if not exists
        console.log('💾 Step 3: Creating database "facebook_data"...');
        const dbCheckResult = await client.query(`
            SELECT 1 FROM pg_database WHERE datname = 'facebook_data'
        `);

        if (dbCheckResult.rows.length === 0) {
            await client.query('CREATE DATABASE facebook_data OWNER fbadmin');
            console.log('✅ Database "facebook_data" created\n');
        } else {
            console.log('✅ Database "facebook_data" already exists\n');
        }

        // Grant privileges
        await client.query('GRANT ALL PRIVILEGES ON DATABASE facebook_data TO fbadmin');

        await client.end();

        // STEP 4: Connect to facebook_data database as fbadmin
        console.log('🔌 Step 4: Connecting to "facebook_data" as fbadmin...');
        client = new Client({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            user: 'fbadmin',
            password: 'fbpass123',
            database: 'facebook_data',
            connectionTimeoutMillis: 5000,
        });

        await client.connect();
        console.log('✅ Connected to facebook_data\n');

        // STEP 5: Run init.sql to create tables, views, functions
        console.log('📜 Step 5: Creating tables, views, and functions...');
        const initSqlPath = path.join(__dirname, 'database', 'init.sql');

        if (fs.existsSync(initSqlPath)) {
            const initSql = fs.readFileSync(initSqlPath, 'utf8');

            // Remove the CREATE ROLE part since we already did it
            const sqlWithoutCreateRole = initSql.replace(/DO \$\$[\s\S]*?END\s*\$\$;/m, '');

            await client.query(sqlWithoutCreateRole);
            console.log('✅ All tables, views, and functions created\n');
        } else {
            console.log('⚠️  init.sql not found, creating tables manually...\n');

            // Create basic tables
            await client.query(`
                CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

                CREATE TABLE IF NOT EXISTS posts (
                    id SERIAL PRIMARY KEY,
                    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
                    author VARCHAR(255),
                    author_url TEXT,
                    author_followers INTEGER DEFAULT 0,
                    text TEXT,
                    timestamp VARCHAR(255),
                    timestamp_iso TIMESTAMP,
                    timestamp_unix BIGINT,
                    reactions INTEGER DEFAULT 0,
                    comments INTEGER DEFAULT 0,
                    shares INTEGER DEFAULT 0,
                    views INTEGER DEFAULT 0,
                    post_url TEXT,
                    share_url TEXT,
                    image_url TEXT,
                    video_url TEXT,
                    image_source TEXT,
                    video_source TEXT,
                    has_image BOOLEAN DEFAULT FALSE,
                    has_video BOOLEAN DEFAULT FALSE,
                    query_used VARCHAR(255),
                    filter_year VARCHAR(10),
                    location VARCHAR(255),
                    music_title VARCHAR(500),
                    music_artist VARCHAR(255),
                    scraped_at TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT NOW(),
                    created_at TIMESTAMP DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS comments (
                    id SERIAL PRIMARY KEY,
                    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
                    post_author VARCHAR(255),
                    post_url TEXT,
                    comment_id VARCHAR(255),
                    comment_author VARCHAR(255),
                    comment_author_url TEXT,
                    comment_text TEXT,
                    comment_timestamp VARCHAR(255),
                    comment_timestamp_unix BIGINT,
                    comment_reactions INTEGER DEFAULT 0,
                    comment_replies_count INTEGER DEFAULT 0,
                    comment_depth INTEGER DEFAULT 0,
                    data_source VARCHAR(50) DEFAULT 'html',
                    parent_comment_id VARCHAR(255),
                    created_at TIMESTAMP DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author);
                CREATE INDEX IF NOT EXISTS idx_posts_url ON posts(post_url);
                CREATE INDEX IF NOT EXISTS idx_comments_post_url ON comments(post_url);
            `);
            console.log('✅ Basic tables created\n');
        }

        // STEP 6: Verify setup
        console.log('🔍 Step 6: Verifying setup...');
        const tablesResult = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        console.log('✅ Tables found:');
        tablesResult.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });

        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ AUTO-SETUP COMPLETE!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('🎯 Next steps:');
        console.log('   1. Test connection: node test-db-connection.js');
        console.log('   2. Run scraper: node facebookkey.js');
        console.log('');

    } catch (error) {
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('❌ Setup failed!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('Error details:');
        console.log(`   Code:    ${error.code || 'N/A'}`);
        console.log(`   Message: ${error.message}`);
        console.log('');

        if (error.code === 'ECONNREFUSED') {
            console.log('💡 Solution:');
            console.log('   - Make sure PostgreSQL container is running');
            console.log('   - Run: docker ps');
            console.log('   - If not running: docker-compose up -d postgres');
        } else if (error.code === '28P01' || error.code === '28000') {
            console.log('💡 Solution:');
            console.log('   - Check POSTGRES_PASSWORD in .env file');
            console.log('   - Default superuser password should be "fbpass123"');
        }

        process.exit(1);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

setupDatabase();
