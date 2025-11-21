#!/usr/bin/env node
/**
 * Test Database Connection
 * Usage: node test-db-connection.js
 */

require('dotenv').config();
const { Pool } = require('pg');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔌 Testing PostgreSQL Database Connection');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// Show configuration (hide password)
console.log('📋 Configuration:');
console.log(`   Host:     ${process.env.DB_HOST || 'localhost'}`);
console.log(`   Port:     ${process.env.DB_PORT || 5432}`);
console.log(`   User:     ${process.env.DB_USER || 'fbadmin'}`);
console.log(`   Password: ${'*'.repeat((process.env.DB_PASSWORD || 'fbpass123').length)}`);
console.log(`   Database: ${process.env.DB_NAME || 'facebook_data'}`);
console.log('');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'fbadmin',
    password: process.env.DB_PASSWORD || 'fbpass123',
    database: process.env.DB_NAME || 'facebook_data',
    connectionTimeoutMillis: 5000,
});

async function testConnection() {
    try {
        console.log('🔄 Connecting to database...');

        // Test 1: Basic Connection
        const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
        console.log('✅ Connection successful!');
        console.log('');
        console.log('📊 Database Info:');
        console.log(`   Current Time: ${result.rows[0].current_time}`);
        console.log(`   PostgreSQL:   ${result.rows[0].pg_version.split(',')[0]}`);
        console.log('');

        // Test 2: Check Tables
        console.log('🔍 Checking tables...');
        const tables = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);

        if (tables.rows.length > 0) {
            console.log('✅ Tables found:');
            tables.rows.forEach(row => {
                console.log(`   - ${row.table_name}`);
            });
        } else {
            console.log('⚠️  No tables found. Run database/init.sql to create schema.');
        }
        console.log('');

        // Test 3: Count Data
        try {
            const postCount = await pool.query('SELECT COUNT(*) as count FROM posts');
            const commentCount = await pool.query('SELECT COUNT(*) as count FROM comments');

            console.log('📈 Data Statistics:');
            console.log(`   Posts:    ${parseInt(postCount.rows[0].count).toLocaleString()}`);
            console.log(`   Comments: ${parseInt(commentCount.rows[0].count).toLocaleString()}`);
        } catch (err) {
            console.log('⚠️  Tables not yet created. Run database/init.sql first.');
        }

        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ All tests passed! Database is ready.');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('❌ Connection failed!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('Error details:');
        console.log(`   Code:    ${error.code || 'N/A'}`);
        console.log(`   Message: ${error.message}`);
        console.log('');

        // Common errors and solutions
        if (error.code === 'ECONNREFUSED') {
            console.log('💡 Solution:');
            console.log('   - Make sure PostgreSQL is running');
            console.log('   - Check if Docker containers are running: docker ps');
            console.log('   - Start containers: docker-compose up -d postgres');
        } else if (error.code === '28P01') {
            console.log('💡 Solution:');
            console.log('   - Check username/password in .env file');
            console.log('   - Verify POSTGRES_USER and POSTGRES_PASSWORD match');
        } else if (error.code === '3D000') {
            console.log('💡 Solution:');
            console.log('   - Database does not exist');
            console.log('   - Create database: docker-compose up -d postgres');
        }

        process.exit(1);
    } finally {
        await pool.end();
    }
}

testConnection();
