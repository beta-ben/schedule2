import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

const LEGACY_HOST = 'localhost'
const LEGACY_PORT = '8787'
const LEGACY_TARGET = `${LEGACY_HOST}:${LEGACY_PORT}`

// Runtime stale host guard (fetch + EventSource) to neutralize legacy localhost port 8787 references.
;(function installFetchRewrite(){
  const DEAD = LEGACY_TARGET
  if(typeof window === 'undefined' || !window.fetch) return
  const orig = window.fetch.bind(window)
  let warned=false
  window.fetch = (input, init)=>{
    try{
      if(typeof input === 'string' && input.includes(DEAD)){
        const u=new URL(input.replace(DEAD, window.location.host))
        if(u.port==='8787') u.port=window.location.port
        if(!warned){ console.info('[rewrite-8787] fetch ->', u.toString()); warned=true }
        return orig(u.toString(), init as any)
      }else if(input instanceof URL && input.host.includes(DEAD)){
        const u=new URL(input.toString().replace(DEAD, window.location.host))
        if(u.port==='8787') u.port=window.location.port
        if(!warned){ console.info('[rewrite-8787] fetch ->', u.toString()); warned=true }
        return orig(u as any, init as any)
      }
    }catch{}
    return orig(input as any, init as any)
  }
})()

;(function installEventSourceRewrite(){
  const DEAD=LEGACY_TARGET
  if(typeof window==='undefined' || !(window as any).EventSource) return
  const Orig=(window as any).EventSource
  let warned=false
  try{
    (window as any).EventSource=function(url: string | URL, opts?: any){
      try{
        if(typeof url==='string' && url.includes(DEAD)){
          const u=new URL(url.replace(DEAD, window.location.host))
          if(u.port==='8787') u.port=window.location.port
          if(!warned){ console.info('[rewrite-8787] EventSource ->', u.toString()); warned=true }
          return new Orig(u.toString(), opts)
        }else if(url instanceof URL && (url as URL).host.includes(DEAD)){
          const u=new URL((url as URL).toString().replace(DEAD, window.location.host))
          if(u.port==='8787') u.port=window.location.port
          if(!warned){ console.info('[rewrite-8787] EventSource ->', u.toString()); warned=true }
          return new Orig(u, opts)
        }
      }catch{}
      return new Orig(url as any, opts)
    }
    ;(window as any).EventSource.prototype=Orig.prototype
  }catch{}
})()

// Hard guard: rewrite any lingering code pointing at localhost port 8787 to current origin.
;(function installFetchRewrite(){
  const DEAD = LEGACY_TARGET
  if(typeof window === 'undefined' || !window.fetch) return
  const orig = window.fetch.bind(window)
  let warned = false
  window.fetch = (input: RequestInfo | URL, init?: RequestInit)=>{
    try{
      if(typeof input === 'string' && input.includes(DEAD)){
        const u = new URL(input.replace(DEAD, window.location.host))
        if(u.port === '8787') u.port = window.location.port
        if(!warned){ console.info('[rewrite-8787] Rewriting stale 8787 request to', u.toString()); warned = true }
        return orig(u.toString(), init)
      } else if(input instanceof URL && input.host.includes(DEAD)){
        const u = new URL(input.toString().replace(DEAD, window.location.host))
        if(u.port === '8787') u.port = window.location.port
        if(!warned){ console.info('[rewrite-8787] Rewriting stale 8787 request to', u.toString()); warned = true }
        return orig(u, init)
      }
    }catch{}
    return orig(input as any, init)
  }
})()

// Parallel guard: patch EventSource so any stale hard-coded 8787 host is transparently rewritten.
;(function installEventSourceRewrite(){
  const DEAD = LEGACY_TARGET
  if(typeof window === 'undefined' || !(window as any).EventSource) return
  const OrigES = (window as any).EventSource
  let warned = false
  try{
    ;(window as any).EventSource = function(url: string | URL, eventSourceInitDict?: EventSourceInit){
      try{
        if(typeof url === 'string' && url.includes(DEAD)){
          const u = new URL(url.replace(DEAD, window.location.host))
          if(u.port === '8787') u.port = window.location.port
          if(!warned){ console.info('[rewrite-8787] Rewriting stale 8787 EventSource to', u.toString()); warned = true }
          return new OrigES(u.toString(), eventSourceInitDict)
        }else if(url instanceof URL && (url as URL).host.includes(DEAD)){
          const u = new URL((url as URL).toString().replace(DEAD, window.location.host))
          if(u.port === '8787') u.port = window.location.port
          if(!warned){ console.info('[rewrite-8787] Rewriting stale 8787 EventSource to', u.toString()); warned = true }
          return new OrigES(u, eventSourceInitDict)
        }
      }catch{}
      return new OrigES(url as any, eventSourceInitDict)
    }
    ;(window as any).EventSource.prototype = OrigES.prototype
  }catch{}
})()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
