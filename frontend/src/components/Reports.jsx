import { useState, useEffect } from 'react'
import { getMembershipYears, getUnpaidMembershipReport } from '../api'

// ── CSV helpers ───────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  ['lastName', 'Last Name'],
  ['firstName', 'First Name'],
  ['spouse', 'Spouse'],
  ['email', 'Email'],
  ['cellPhone', 'Cell Phone'],
  ['homePhone', 'Home Phone'],
  ['address1', 'Address 1'],
  ['address2', 'Address 2'],
  ['city', 'City'],
  ['state', 'State'],
  ['zip', 'Zip'],
]

function csvEscape(val) {
  const s = val == null ? '' : String(val)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(report) {
  const header = CSV_COLUMNS.map(([, label]) => label).join(',')
  const rows = report.members.map((m) =>
    CSV_COLUMNS.map(([key]) => csvEscape(m[key])).join(',')
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `unpaid_membership_${report.year}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Reports() {
  const [years, setYears] = useState([])
  const [year, setYear] = useState('')
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getMembershipYears()
      .then((res) => {
        const ys = res.data.years || []
        setYears(ys)
        if (ys.length > 0) setYear(String(ys[0]))
      })
      .catch(() => setError('Could not load membership years'))
  }, [])

  const runReport = async () => {
    if (!year) return
    setLoading(true)
    setError('')
    setReport(null)
    try {
      const res = await getUnpaidMembershipReport(year)
      setReport(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-bcs-primary mb-4">Reports</h1>

      {/* Report selector */}
      <div className="card p-4 mb-4">
        <h2 className="font-semibold text-gray-800 mb-1">Outstanding Annual Membership</h2>
        <p className="text-sm text-gray-500 mb-3">
          Active members (excluding life members) who have not yet paid their
          annual membership for the selected year.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Membership Year:</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bcs-primary"
          >
            {years.length === 0 && <option value="">No membership events found</option>}
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={runReport} disabled={loading || !year}>
            {loading ? 'Running…' : 'Run Report'}
          </button>
          {report && report.members.length > 0 && (
            <button className="btn-secondary" onClick={() => downloadCsv(report)}>
              ⬇ Download CSV
            </button>
          )}
        </div>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </div>

      {/* Results */}
      {report && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-800">
              {report.count} member{report.count === 1 ? '' : 's'} with unpaid {report.year} membership
            </span>
            <span className="text-xs text-gray-500">
              Based on: {report.events.map((e) => e.eventName).join(', ')}
            </span>
          </div>

          {report.members.length === 0 ? (
            <p className="p-6 text-gray-500 text-sm">
              🎉 All active members have paid their {report.year} membership.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-bcs-light border-b border-gray-100">
                  <tr>
                    <th className="table-th">#</th>
                    <th className="table-th">Name</th>
                    <th className="table-th">Spouse</th>
                    <th className="table-th">Email</th>
                    <th className="table-th">Phone</th>
                    <th className="table-th">City/State</th>
                  </tr>
                </thead>
                <tbody>
                  {report.members.map((m, i) => (
                    <tr key={m.personId} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="table-td text-gray-400">{i + 1}</td>
                      <td className="table-td font-medium">{m.lastName}, {m.firstName}</td>
                      <td className="table-td">{m.spouse || '—'}</td>
                      <td className="table-td">{m.email || '—'}</td>
                      <td className="table-td">{m.cellPhone || m.homePhone || '—'}</td>
                      <td className="table-td">
                        {[m.city, m.state].filter(Boolean).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
