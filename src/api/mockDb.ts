// Mock database for testing without PostgreSQL
export class MockDatabase {
  private versions: any[] = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      week_start: '2024-01-07',
      status: 'active',
      notes: 'Current week schedule',
      created_at: '2024-01-01T00:00:00Z'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      week_start: '2024-01-14',
      status: 'draft',
      notes: 'Next week draft',
      created_at: '2024-01-08T00:00:00Z'
    }
  ]

  private contents: any[] = [
    {
      id: '650e8400-e29b-41d4-a716-446655440001',
      version_id: '550e8400-e29b-41d4-a716-446655440001',
      agent_id: '750e8400-e29b-41d4-a716-446655440001',
      start: '2024-01-07T09:00:00Z',
      end: '2024-01-07T17:00:00Z',
      posture_id: 'standing',
      notes: 'Morning shift'
    },
    {
      id: '650e8400-e29b-41d4-a716-446655440002',
      version_id: '550e8400-e29b-41d4-a716-446655440001',
      agent_id: '750e8400-e29b-41d4-a716-446655440002',
      start: '2024-01-07T17:00:00Z',
      end: '2024-01-08T01:00:00Z',
      posture_id: 'sitting',
      notes: 'Evening shift'
    }
  ]

  async query(text: string, params?: any[]): Promise<{ rows: any[] }> {
    console.log('Mock query:', text, params)
    
    if (text.includes('SELECT id, week_start, status, notes, created_at FROM schedule_versions ORDER BY')) {
      return { rows: this.versions }
    }
    
    if (text.includes('SELECT id, week_start, status, notes, created_at FROM schedule_versions WHERE id=$1')) {
      const id = params?.[0]
      const version = this.versions.find(v => v.id === id)
      return { rows: version ? [version] : [] }
    }
    
    if (text.includes('SELECT id, agent_id, start, "end", posture_id, notes FROM schedule_version_contents WHERE version_id=$1')) {
      const version_id = params?.[0]
      const shifts = this.contents.filter(c => c.version_id === version_id)
      return { rows: shifts }
    }
    
    if (text.includes('SELECT start, "end" FROM schedule_version_contents WHERE version_id=$1')) {
      const version_id = params?.[0]
      const shifts = this.contents.filter(c => c.version_id === version_id)
      return { rows: shifts.map(s => ({ start: s.start, end: s.end })) }
    }
    
    return { rows: [] }
  }
}

export const mockDb = new MockDatabase()