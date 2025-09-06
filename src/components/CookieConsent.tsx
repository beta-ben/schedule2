import React from 'react'

function isProdHost() {
  if (typeof location === 'undefined') return false
  const h = location.hostname
  return /(^|\.)teamschedule\.cc$/.test(h) && h !== 'staging.teamschedule.cc'
}

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val) } catch {}
}
function cookieGet(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'))
  return m ? decodeURIComponent(m[1]) : null
}
function cookieSet(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return
  const exp = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Expires=${exp}; SameSite=Lax` 
}

const KEY = 'cookie_consent_v1'

export default function CookieConsent(){
  const [show, setShow] = React.useState(false)

  React.useEffect(()=>{
    if (!isProdHost()) { setShow(false); return }
    const v = lsGet(KEY) || cookieGet(KEY)
    setShow(v !== 'accepted')
  }, [])

  const accept = ()=>{
    lsSet(KEY, 'accepted'); cookieSet(KEY, 'accepted'); setShow(false)
  }

  if(!show) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-5xl m-3 rounded-md border border-neutral-700/40 bg-neutral-900/95 text-neutral-100 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-neutral-900/80">
        <div className="p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="text-sm leading-relaxed">
            We use essential cookies for sign‑in security (session and CSRF). No analytics or tracking cookies are set. 
            See our <a className="underline hover:no-underline" href="/cookies.html" target="_blank" rel="noopener noreferrer">cookie policy</a>.
          </div>
          <div className="flex-1" />
          <button onClick={accept} className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Accept</button>
        </div>
      </div>
    </div>
  )
}
