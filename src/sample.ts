import { DAYS } from './constants'
import type { PTO, Shift } from './types'
import { uid, minToHHMM } from './lib/utils'

export function generateSample(){
  const names = Array.from({length:40},(_,i)=>`Agent${i+1}`)
  const shifts: Shift[] = []
  const pto: PTO[] = [
    { id: uid(), person: 'Agent5', startDate: '2025-08-21', endDate: '2025-08-23', notes: 'Vacation' },
    { id: uid(), person: 'Agent12', startDate: '2025-08-22', endDate: '2025-08-22', notes: 'Appt' },
  ]
  for(const day of DAYS){
    if(day==='Sat'||day==='Sun') continue
    let nameIdx=0
    const slots: number[]=[]
    let t=6*60
    while(t<=17*60+30){ slots.push(t); t += 120 + Math.floor(Math.random()*61) }
    for(const slot of slots){
      const starters = 2 + Math.floor(Math.random()*2)
      for(let i=0;i<starters;i++){
        const person = names[nameIdx % names.length]
        nameIdx++
        const startMin = slot
        const endMinRaw = slot + 510 // 8.5h
        if(endMinRaw<=1440){
          shifts.push({ id: uid(), person, day, start: minToHHMM(startMin), end: minToHHMM(endMinRaw) })
        }else{
          const spill=endMinRaw-1440
          const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as const
          const nextDay = days[(days.indexOf(day as any)+1)%7] as any
          shifts.push({ id: uid(), person, day, start: minToHHMM(startMin), end: '24:00' })
          shifts.push({ id: uid(), person, day: nextDay, start: '00:00', end: minToHHMM(spill) })
        }
      }
    }
  }
  return { shifts, pto }
}
