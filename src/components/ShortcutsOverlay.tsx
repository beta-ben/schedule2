import React from 'react'

type ViewMode = 'schedule'|'teams'|'manageV2'|'stagingPreview'|'immersive'

type Props = {
  dark: boolean
  view: ViewMode
  onClose: ()=>void
  previewEnabled: boolean
  immersiveEnabled: boolean
}

export default function ShortcutsOverlay({ dark, view, onClose, previewEnabled, immersiveEnabled }: Props){
  const [agentBtnRect, setAgentBtnRect] = React.useState<DOMRect | null>(null)
  const overlayRef = React.useRef<HTMLDivElement|null>(null)

  // Recompute feature target rects when opened, on resize, and when view changes
  const computeRects = React.useCallback(()=>{
    if(view==='schedule'){
      try{
        const el = document.querySelector('[data-shortcut-id="schedule-agent-button"]') as HTMLElement | null
        const rect = el?.getBoundingClientRect?.()
        setAgentBtnRect(rect || null)
      }catch{ setAgentBtnRect(null) }
    }else{
      setAgentBtnRect(null)
    }
  }, [view])

  React.useEffect(()=>{
    computeRects()
    const onResize = ()=> computeRects()
    window.addEventListener('resize', onResize)
    const iv = window.setInterval(computeRects, 400) // in case layout settles late
    return ()=>{ window.removeEventListener('resize', onResize); window.clearInterval(iv) }
  }, [computeRects])

  React.useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{
      if(e.key==='Escape'){ e.preventDefault(); onClose(); return }
      if(e.key==='?'){ e.preventDefault(); onClose(); return }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [onClose])

  const panelCls = [
    'max-w-xl w-[min(92vw,40rem)] rounded-2xl p-4 shadow-lg border',
    dark ? 'bg-neutral-900 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
  ].join(' ')

  const maskCls = [
    'fixed inset-0 z-[1000] flex items-center justify-center',
    dark ? 'bg-black/60' : 'bg-black/30'
  ].join(' ')

  const pill = (label:string)=> (
    <span className={[
      'inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] tabular-nums',
      dark ? 'border-neutral-700 bg-neutral-800 text-neutral-100' : 'border-neutral-300 bg-neutral-50 text-neutral-900'
    ].join(' ')}>{label}</span>
  )

  return (
    <div ref={overlayRef} className={maskCls} onMouseDown={(e)=>{ if(e.target===overlayRef.current) onClose() }}>
      {/* Feature indicator: Agent button in Schedule view */}
      {view==='schedule' && agentBtnRect && (
        <div className="pointer-events-none fixed z-[1100]" style={{ left: agentBtnRect.left + window.scrollX, top: agentBtnRect.top + window.scrollY, width: agentBtnRect.width, height: agentBtnRect.height }}>
          {/* Highlight box */}
          <div className="absolute inset-0 rounded-lg ring-2 ring-blue-500/80" />
          {/* Label bubble */}
          <div className={[
            'absolute -translate-y-full mb-2 px-2 py-1 rounded text-xs whitespace-nowrap',
            dark ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white'
          ].join(' ')} style={{ left: '50%', transform: 'translate(-50%,-6px)' }}>
            Agent selector • press {String.fromCharCode(96)}a{String.fromCharCode(96)}
          </div>
        </div>
      )}

      {/* Main cheatsheet panel */}
      <div className={panelCls} role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
        <div className="flex items-center justify-between mb-2">
          <div className="text-base font-semibold">Keyboard Shortcuts</div>
          <button onClick={onClose} className={[
            'h-8 px-3 rounded-lg border text-sm',
            dark ? 'bg-neutral-900 border-neutral-700 hover:bg-neutral-800' : 'bg-white border-neutral-300 hover:bg-neutral-100'
          ].join(' ')} aria-label="Close">Close</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
          <div>
            <div className="text-xs font-medium mb-1 opacity-80">Global</div>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2">{pill('?')} <span>Show shortcuts</span></li>
              <li className="flex items-center gap-2">{pill('Cmd/Ctrl+K')} <span>Command palette</span></li>
              <li className="flex items-center gap-2">
                {pill(previewEnabled ? (immersiveEnabled ? 'Alt+1/2/3/4/5' : 'Alt+1/2/3/4') : 'Alt+1/2/3')}
                <span>
                  Switch view (Schedule/Teams/Manage
                  {immersiveEnabled ? '/Immersive' : ''}
                  {previewEnabled ? '/Flow' : ''}
                  )
                </span>
              </li>
              <li className="flex items-center gap-2">{pill('Cmd/Ctrl+←/→')} <span>Previous/Next week</span></li>
            </ul>
          </div>
          {view==='schedule' && (
            <div>
              <div className="text-xs font-medium mb-1 opacity-80">Schedule</div>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center gap-2">{pill('←/→')} <span>Previous/Next day</span></li>
                <li className="flex items-center gap-2">{pill('1–7')} <span>Jump to Sun–Sat</span></li>
                <li className="flex items-center gap-2">{pill('A')} <span>Toggle agent selector</span></li>
                <li className="flex items-center gap-2">{pill('S')} <span>Toggle slimline</span></li>
              </ul>
            </div>
          )}
          {view==='manageV2' && (
            <div className="space-y-2">
              <div className="text-xs font-medium opacity-80">Schedule Editor</div>
              <ul className="space-y-1.5 text-sm">
                <li className="flex flex-wrap items-center gap-2">{pill('1')} <span>Show live schedule</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('2')} <span>Show staging schedule</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('Cmd/Ctrl+Z')} <span>Undo shift edits</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('Cmd/Ctrl+Shift+Z')} <span>Redo shift edits</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('L')} <span>Toggle always-on time labels</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('H')} <span>Show or hide off-duty agents</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('[ / ]')} <span>Decrease / increase visible days</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('0')} <span>Reset to full 7-day view</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('Delete')} <span>Delete selected shift(s)</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('Esc')} <span>Clear selection</span></li>
                <li className="flex flex-wrap items-start gap-2">{pill('Double-click')} <span>Blank space to add an 8.5 hr shift</span></li>
                <li className="flex flex-wrap items-start gap-2">{pill('Double-click shift')} <span>Open shift editor</span></li>
              </ul>
            </div>
          )}
          {view==='immersive' && (
            <div className="space-y-2">
              <div className="text-xs font-medium opacity-80">Immersive Waterfall</div>
              <ul className="space-y-1.5 text-sm">
                <li className="flex flex-wrap items-center gap-2">{pill('Drag')} <span>Scrub the timeline</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('Scroll')} <span>Adjust time ±10 minutes</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('⏪ / ⏩')} <span>Hold to rewind / fast forward</span></li>
                <li className="flex flex-wrap items-center gap-2">{pill('Reset')} <span>Return to live time</span></li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}