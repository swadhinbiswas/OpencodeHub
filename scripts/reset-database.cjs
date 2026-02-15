/**
 * Reset Database Script
 * 
 * Drops all tables and recreates the schema from scratch
 * 
 * Usage: node scripts/reset-database.cjs
 */

const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

// Load .env file manually
const envPath = path.join(__dirname, '..', '.env');
const envFile = fs.readFileSync(envPath, 'utf8');
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
    }
});

async function resetDatabase() {
    const connectionString = process.env.DATABASE_URL;

    console.log('🗑️  Resetting database...\n');

    const sql = postgres(connectionString, { max: 1 });
    const db = drizzle(sql);

    try {
        // Get all tables
        const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `;

        console.log(`Found ${tables.length} tables to drop:\n`);
        tables.forEach(t => console.log(`  - ${t.tablename}`));

        // Drop all tables
        for (const table of tables) {
            console.log(`\nDropping table: ${table.tablename}`);
            await sql.unsafe(`DROP TABLE IF EXISTS "${table.tablename}" CASCADE`);
        }

        console.log('\n✅ All tables dropped successfully!');
        console.log('\nNow run: npm run db:push');
        console.log('to recreate the schema\n');

    } catch (error) {
        console.error('❌ Error resetting database:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

resetDatabase();
