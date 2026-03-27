import pool from './index';

// DDL statements - run sequentially, not in a transaction
// (CREATE EXTENSION, CREATE OR REPLACE FUNCTION, CREATE TRIGGER can't run
// reliably inside transactions in all Postgres versions)
const ddlStatements = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    column_name TEXT NOT NULL CHECK (column_name IN ('todo', 'inprogress', 'done')),
    position TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_tasks_column_position ON tasks(column_name, position)`,

  `CREATE INDEX IF NOT EXISTS idx_tasks_version ON tasks(id, version)`,

  `CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ language 'plpgsql'`,

  `DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks`,

  `CREATE TRIGGER update_tasks_updated_at
   BEFORE UPDATE ON tasks
   FOR EACH ROW
   EXECUTE PROCEDURE update_updated_at_column()`,
];

async function migrate() {
  const client = await pool.connect();
  try {
    for (const stmt of ddlStatements) {
      await client.query(stmt);
    }
    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

export { migrate };

// Run migration if executed directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
