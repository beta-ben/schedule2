export function computeCoverage(shifts: { start: string; end: string }[], binMinutes = 30){
  // start/end ISO strings; compute counts per bin [0..47] for a week is handled per version
  const dayBins = 24 * (60/binMinutes)
  const bins = new Array(dayBins).fill(0)
  const toMin = (iso: string)=>{ const d=new Date(iso); return d.getUTCHours()*60 + d.getUTCMinutes() }
  for(const s of shifts){
    const a = toMin(s.start); const b = toMin(s.end)
    for(let m=a; m<b; m+=binMinutes){
      const i = Math.floor((m % (24*60)) / binMinutes)
      bins[i]++
    }
  }
  return { binMinutes, bins }
}
