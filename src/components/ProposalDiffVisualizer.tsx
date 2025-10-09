import React from 'react'

type Props = {
  dark: boolean
  live: { shifts: any[]; pto: any[]; overrides?: any[] }
  proposal: { shifts: any[]; pto: any[]; overrides?: any[] }
  mode?: 'overlay' | 'side'
  onlyChanged?: boolean
  fixedOrder?: string[] | null
  [key: string]: unknown
}

export default function ProposalDiffVisualizer(_props: Props){
  // Proposals UI has been retired; keep a stub component so legacy imports still render.
  return (
    <div className="text-xs opacity-60">
      Proposal comparison is currently unavailable.
    </div>
  )
}
