import React from 'react'

import { requestMagicLink } from '../../lib/api'

export default function MagicLoginPanel({ dark }:{ dark:boolean }){
  const [email, setEmail] = React.useState('')
  const [msg, setMsg] = React.useState('')
  const [link, setLink] = React.useState<string|undefined>(undefined)
  return (
    <form onSubmit={(e)=>{ e.preventDefault(); (async()=>{
      setMsg(''); setLink(undefined)
      const r = await requestMagicLink(email, 'admin')
      if(r.ok){
        if(r.link){ setLink(r.link); setMsg('Dev mode: click the link below to sign in.') }
        else setMsg('Check your inbox for the sign-in link.')
      }else{
        setMsg('Failed to request link. Check email format and try again.')
      }
    })() }}>
      <div className="flex gap-2 items-center">
        <input type="email" required className={["flex-1 border rounded-xl px-3 py-2", dark && "bg-neutral-900 border-neutral-700"].filter(Boolean).join(' ')} value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@company.com" />
        <button type="submit" className={["rounded-xl px-3 py-2 text-sm font-medium border", dark ? "bg-neutral-800 border-neutral-700" : "bg-blue-600 text-white border-blue-600"].join(' ')}>Email link</button>
      </div>
      {msg && (<div className="text-xs mt-2 opacity-80">{msg}</div>)}
      {link && (
        <div className="mt-2 text-xs break-all">
          <a className="underline" href={link} target="_blank" rel="noreferrer">{link}</a>
        </div>
      )}
    </form>
  )
}
