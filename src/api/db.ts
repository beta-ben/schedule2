import 'dotenv/config'
import { Pool } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/schedule2'

export const pool = new Pool({ connectionString: DATABASE_URL })

export async function query<T=any>(text: string, params?: any[]): Promise<{ rows: T[] }>{
  const client = await pool.connect()
  try{
    const res = await client.query(text, params)
    return { rows: res.rows as T[] }
  } finally {
    client.release()
  }
}
