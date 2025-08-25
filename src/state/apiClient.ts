export async function api<T>(path: string, init?: RequestInit): Promise<T>{
  const base = import.meta.env.VITE_API_BASE || ''
  const r = await fetch(base + path, init)
  if(!r.ok) throw new Error(`API ${r.status}`)
  return r.json()
}
