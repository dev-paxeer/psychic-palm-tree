import postgres from 'postgres';
import 'dotenv/config';

/**
 * Run migrations to create tables in PostgreSQL.
 * Using raw SQL for simplicity — no migration files needed.
 */
async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('✗ DATABASE_URL is not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);

  await sql`DROP TABLE IF EXISTS faucet_drips`;

  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(42) NOT NULL,
      project_name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      demo_url TEXT,
      category VARCHAR(50) NOT NULL,
      votes INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(42) NOT NULL UNIQUE,
      display_name VARCHAR(100),
      bio TEXT,
      twitter VARCHAR(100),
      github VARCHAR(100),
      website TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`DROP TABLE IF EXISTS scaffold_logs`;
  await sql`
    CREATE TABLE IF NOT EXISTS scaffold_logs (
      id SERIAL PRIMARY KEY,
      scaffold_type VARCHAR(20) NOT NULL,
      template VARCHAR(80) NOT NULL,
      project_name VARCHAR(255) NOT NULL,
      wallet_address VARCHAR(42),
      variables JSONB,
      s3_key TEXT,
      downloads INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  console.log('✓ Database migrated successfully');
  await sql.end();
}

migrate().catch((err) => {
  console.error('✗ Migration failed:', err);
  process.exit(1);
});
