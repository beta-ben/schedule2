import { useEffect, useState } from 'react'

export type ThemeBase = 'default' | 'night' | 'noir' | 'prism'

const decodeThemeBase = (value?: string | null): ThemeBase => {
  if(!value) return 'default'
  const next = value.toLowerCase()
  if(next.startsWith('night')) return 'night'
  if(next.startsWith('noir')) return 'noir'
  if(next.startsWith('prism')) return 'prism'
  return 'default'
}

const readThemeFromDom = (): ThemeBase => {
  if(typeof window === 'undefined') return 'default'
  try{
    const attr = document.querySelector('[data-theme]')?.getAttribute('data-theme')
    if(attr === 'night' || attr === 'noir' || attr === 'prism') return attr
    if(attr === 'default') return 'default'
  }catch{}
  try{
    return decodeThemeBase(localStorage.getItem('schedule_theme'))
  }catch{
    return 'default'
  }
}

export function useThemeBase(): ThemeBase {
  const [theme, setTheme] = useState<ThemeBase>(()=> readThemeFromDom())

  useEffect(()=>{
    if(typeof window === 'undefined') return
    const update = ()=> setTheme(readThemeFromDom())
    update()
    const handler = (event: Event)=>{
      const raw = (event as CustomEvent).detail?.value as string | undefined
      if(raw){
        setTheme(decodeThemeBase(raw))
      }else{
        update()
      }
    }
    window.addEventListener('schedule:set-theme', handler as any)
    let observer: MutationObserver | null = null
    try{
      const root = document.querySelector('[data-theme]')
      if(root && typeof MutationObserver !== 'undefined'){
        observer = new MutationObserver(update)
        observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
      }
    }catch{}
    return ()=>{
      window.removeEventListener('schedule:set-theme', handler as any)
      if(observer) observer.disconnect()
    }
  },[])

  return theme
}
