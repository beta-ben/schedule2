import 'dotenv/config'
import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL

let pool: Pool | null = null

// Only create pool if DATABASE_URL is provided
if (DATABASE_URL && DATABASE_URL !== 'postgres://postgres:postgres@localhost:5432/schedule2') {
  pool = new Pool({ connectionString: DATABASE_URL })
}

export async function query<T=any>(text: string, params?: any[]): Promise<{ rows: T[] }>{
  if (!pool) {
    throw new Error('Database not configured')
  }
  const client = await pool.connect()
  try{
    const res = await client.query(text, params)
    return { rows: res.rows as T[] }
  } finally {
    client.release()
  }
}
