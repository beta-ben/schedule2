import { pool } from './db'
import fs from 'fs'
import path from 'path'

async function run(){
  const dir = path.resolve(__dirname, 'migrations')
  const files = fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()
  const client = await pool.connect()
  try{
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    for(const f of files){
      const sql = fs.readFileSync(path.join(dir,f),'utf8')
      console.log('Applying', f)
      await client.query(sql)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(err=>{ console.error(err); process.exit(1) })
