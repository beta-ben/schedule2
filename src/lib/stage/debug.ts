const STORAGE_KEY = 'schedule2.stage.debug'

type ConsoleLevel = 'debug' | 'info' | 'warn' | 'error'

function parseFlag(value: string | null | undefined): boolean | null{
  if(!value) return null
  const normalized = value.trim().toLowerCase()
  if(['1','true','yes','on','debug'].includes(normalized)) return true
  if(['0','false','no','off'].includes(normalized)) return false
  return null
}

function safeGetLocalStorage(key: string): string | null{
  try{
    if(typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(key)
  }catch{
    return null
  }
}

function safeSetLocalStorage(key: string, value: string): void{
  try{
    if(typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(key, value)
  }catch{
    /* ignore */
  }
}

function resolveInitialFlag(): boolean{
  let flag: boolean | null = null
  if(typeof window !== 'undefined'){
    try{
      const params = new URLSearchParams(window.location.search)
      const override = parseFlag(params.get('stageDebug'))
      if(override !== null){
        flag = override
        safeSetLocalStorage(STORAGE_KEY, override ? '1' : '0')
      }
    }catch{
      /* ignore */
    }
  }
  if(flag === null){
    const stored = parseFlag(safeGetLocalStorage(STORAGE_KEY))
    if(stored !== null){
      flag = stored
    }
  }
  if(flag === null){
    const envRaw = (import.meta.env as any)?.VITE_STAGE_DEBUG as string | undefined
    const envFlag = parseFlag(envRaw)
    if(envFlag !== null){
      flag = envFlag
    }
  }
  if(flag === null && typeof window !== 'undefined'){
    try{
      const host = window.location.hostname.toLowerCase()
      if(host.includes('staging')){
        flag = true
      }
    }catch{
      /* ignore */
    }
  }
  return flag ?? false
}

let stageDebugEnabled = resolveInitialFlag()

export function isStageDebugEnabled(): boolean{
  return stageDebugEnabled
}

export function setStageDebugEnabled(enabled: boolean): void{
  stageDebugEnabled = Boolean(enabled)
  if(typeof window !== 'undefined'){
    safeSetLocalStorage(STORAGE_KEY, stageDebugEnabled ? '1' : '0')
  }
}

export function stageDebugLog(event: string, details?: unknown, level: ConsoleLevel = 'info'): void{
  if(!stageDebugEnabled) return
  const ts = new Date().toISOString()
  const prefix = `[stage-debug] ${ts} ${event}`
  const payload = details === undefined ? '' : details
  const logger = (console[level] || console.info).bind(console)
  logger(prefix, payload)
}

if(typeof window !== 'undefined'){
  const global = window as typeof window & { __stageDebugEnabled?: boolean; toggleStageDebug?: (next?: boolean)=>boolean }
  global.__stageDebugEnabled = stageDebugEnabled
  global.toggleStageDebug = (next?: boolean)=>{
    if(typeof next === 'boolean'){
      setStageDebugEnabled(next)
    }else{
      setStageDebugEnabled(!stageDebugEnabled)
    }
    global.__stageDebugEnabled = stageDebugEnabled
    stageDebugLog('toggle', { enabled: stageDebugEnabled }, 'info')
    return stageDebugEnabled
  }
  window.addEventListener('storage', (evt: StorageEvent)=>{
    if(evt.key === STORAGE_KEY && evt.newValue != null){
      const parsed = parseFlag(evt.newValue)
      if(parsed !== null){
        stageDebugEnabled = parsed
        global.__stageDebugEnabled = parsed
      }
    }
  })
}
