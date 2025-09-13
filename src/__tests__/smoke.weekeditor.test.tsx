import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import WeekEditor from '../components/v2/WeekEditor'

describe('WeekEditor smoke', () => {
  it('renders with minimal props', () => {
    const { getByText } = render(
      <WeekEditor
        dark={true}
        agents={[]}
        onAddAgent={() => {}}
        onUpdateAgent={() => {}}
        onDeleteAgent={() => {}}
        weekStart={'2025-01-05'}
        tz={{ id: 'America/Los_Angeles', label: 'Pacific', offset: -8 }}
        shifts={[]}
        pto={[]}
        tasks={[]}
        calendarSegs={[] as any}
        onUpdateShift={() => {}}
        onDeleteShift={() => {}}
        onAddShift={() => {}}
        selectedIdx={null}
        onSelectIdx={() => {}}
      />
    )
    expect(getByText(/Agents/)).toBeTruthy()
  })
})

