import { useState, useEffect, useRef } from 'react'
import { getEvents, searchMembers, parsePayPal, parseStripe, saveImport } from '../api'

// ── Member search dropdown ────────────────────────────────────────────────────
function MemberPicker({ value, onChange, placeholder = 'Search member…' }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [open, setOpen]           = useState(false)
  const [display, setDisplay]     = useState(value?.name || '')
  const ref = useRef(null)

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const { data } = await searchMembers(query)
        setResults(data)
      } catch { setResults([]) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const pick = (m) => {
    onChange({ personId: m.personId, name: `${m.firstName} ${m.lastName}` })
    setDisplay(`${m.firstName} ${m.lastName}`)
    setQuery('')
    setOpen(false)
  }

  const clear = () => {
    onChange(null)
    setDisplay('')
    setQuery('')
  }

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1">
        <input
          className="input-field text-xs py-1 flex-1"
          value={display || query}
          placeholder={placeholder}
          onChange={(e) => { setDisplay(''); setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
        />
        {(display || value) && (
          <button type="button" onClick={clear} className="text-gray-400 hover:text-red-500 text-sm px-1">✕</button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-xs">
          {results.map((m) => (
            <li
              key={m.personId}
              className="px-3 py-2 hover:bg-bcs-light cursor-pointer flex justify-between"
              onMouseDown={() => pick(m)}
            >
              <span className="font-medium">{m.firstName} {m.lastName}</span>
              <span className="text-gray-400">{m.email || m.cellPhone || ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Badge: match confidence ───────────────────────────────────────────────────
function MatchBadge({ confidence }) {
  const styles = {
    email:   'bg-green-100 text-green-700',
    name:    'bg-blue-100 text-blue-700',
    address: 'bg-yellow-100 text-yellow-700',
    none:    'bg-gray-100 text-gray-500',
  }
  const labels = { email: '✓ Email', name: '~ Name', address: '~ Address', none: 'Unmatched' }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[confidence] || styles.none}`}>
      {labels[confidence] || 'Unmatched'}
    </span>
  )
}

// ── File drop zone ────────────────────────────────────────────────────────────
function DropZone({ onFile, label }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)

  const handle = (f) => { if (f) onFile(f) }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        drag ? 'border-bcs-primary bg-bcs-light' : 'border-gray-300 hover:border-bcs-primary hover:bg-bcs-light'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]) }}
    >
      <input ref={inputRef} type="file" accept=".csv,.CSV" className="hidden" onChange={(e) => handle(e.target.files[0])} />
      <div className="text-3xl mb-2">📂</div>
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-xs text-gray-400 mt-1">Click to browse or drag & drop a CSV file</p>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ImportTransactions() {
  const [activeTab, setActiveTab]       = useState('paypal')
  const [events, setEvents]             = useState([])
  const [selectedEventId, setEventId]   = useState('')
  const [previewRows, setPreviewRows]   = useState([])     // parsed rows from backend
  const [selections, setSelections]     = useState({})     // {rowIndex: {personId, name} | null | 'ignore'}
  const [parsing, setParsing]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [parseError, setParseError]     = useState('')
  const [saveResult, setSaveResult]     = useState(null)   // {saved, receiptNumbers}
  const [fileName, setFileName]         = useState('')

  useEffect(() => {
    getEvents().then(({ data }) => setEvents(data)).catch(console.error)
  }, [])

  const resetImport = () => {
    setPreviewRows([])
    setSelections({})
    setParseError('')
    setSaveResult(null)
    setFileName('')
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    resetImport()
  }

  const handleFile = async (file) => {
    if (!selectedEventId) {
      setParseError('Please select an event before uploading a file.')
      return
    }
    setFileName(file.name)
    setParseError('')
    setSaveResult(null)
    setParsing(true)
    try {
      const { data } = activeTab === 'paypal'
        ? await parsePayPal(file)
        : await parseStripe(file)
      setPreviewRows(data)
      // Default selections: auto-matched rows are selected, unmatched need action
      const defaultSel = {}
      data.forEach((r) => {
        if (r.matchedPersonId) {
          defaultSel[r.rowIndex] = { personId: r.matchedPersonId, name: r.matchedMemberName }
        } else {
          defaultSel[r.rowIndex] = null   // not yet assigned
        }
      })
      setSelections(defaultSel)
    } catch (err) {
      setParseError(err.response?.data?.detail || 'Failed to parse file. Please check the format.')
    } finally {
      setParsing(false)
    }
  }

  const setRowMember = (rowIndex, member) => {
    setSelections((s) => ({ ...s, [rowIndex]: member }))
  }

  const toggleIgnore = (rowIndex) => {
    setSelections((s) => ({
      ...s,
      [rowIndex]: s[rowIndex] === 'ignore' ? null : 'ignore',
    }))
  }

  const buildNotes = (row) => {
    const parts = []
    if (row.source === 'paypal') parts.push('PayPal')
    if (row.source === 'stripe') parts.push('Stripe')
    if (row.transactionId)  parts.push(`Txn: ${row.transactionId}`)
    if (row.description)    parts.push(row.description)
    if (row.email && row.matchConfidence === 'none') parts.push(`Payer: ${row.email}`)
    if (row.address1 && row.matchConfidence === 'none') {
      const addr = [row.address1, row.address2, row.city, row.state, row.zip].filter(Boolean).join(', ')
      parts.push(`Addr: ${addr}`)
    }
    return parts.join(' | ').slice(0, 200)
  }

  const readyRows = previewRows.filter(
    (r) => selections[r.rowIndex] && selections[r.rowIndex] !== 'ignore'
  )
  const ignoredCount = previewRows.filter((r) => selections[r.rowIndex] === 'ignore').length
  const unmatchedCount = previewRows.filter(
    (r) => !selections[r.rowIndex] || selections[r.rowIndex] === null
  ).length

  const handleSave = async () => {
    if (!selectedEventId) { setParseError('Please select an event.'); return }
    if (readyRows.length === 0) { setParseError('No rows ready to import. Assign members or ignore unmatched rows.'); return }
    setSaving(true)
    setParseError('')
    try {
      const rows = readyRows.map((r) => ({
        personId:  selections[r.rowIndex].personId,
        eventId:   parseInt(selectedEventId),
        txDate:    r.txDate,
        amount:    r.amount,
        notes:     buildNotes(r),
      }))
      const { data } = await saveImport(rows)
      setSaveResult(data)
      setPreviewRows([])
      setSelections({})
      setFileName('')
    } catch (err) {
      setParseError(err.response?.data?.detail || 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-bcs-primary">Import Transactions</h1>
        <p className="text-gray-500 text-sm mt-0.5">Import contributions from PayPal and Stripe CSV exports</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { id: 'paypal', label: '🅿 PayPal', color: 'text-blue-700' },
          { id: 'stripe', label: '🟣 Stripe', color: 'text-purple-700' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={`px-5 py-2 rounded-lg font-medium text-sm transition-colors ${
              activeTab === t.id
                ? 'bg-bcs-primary text-white shadow'
                : 'bg-white text-gray-600 hover:bg-bcs-light border border-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Event selector */}
      <div className="card p-5 mb-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          1. Select the Event these contributions belong to <span className="text-red-500">*</span>
        </label>
        <select
          className="input-field max-w-sm"
          value={selectedEventId}
          onChange={(e) => { setEventId(e.target.value); resetImport() }}
        >
          <option value="">— Choose an event —</option>
          {events.map((ev) => (
            <option key={ev.eventId} value={ev.eventId}>{ev.eventName} ({ev.eventDate})</option>
          ))}
        </select>
      </div>

      {/* Upload area */}
      {selectedEventId && previewRows.length === 0 && !saveResult && (
        <div className="card p-5 mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            2. Upload {activeTab === 'paypal' ? 'PayPal' : 'Stripe'} CSV export
          </label>
          {parsing ? (
            <div className="text-center py-10 text-gray-400">
              <div className="text-3xl mb-2 animate-spin inline-block">⚙️</div>
              <p className="text-sm">Parsing and matching transactions…</p>
            </div>
          ) : (
            <DropZone
              label={`Drop your ${activeTab === 'paypal' ? 'PayPal' : 'Stripe'} CSV here`}
              onFile={handleFile}
            />
          )}
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {parseError}
        </div>
      )}

      {/* Save result */}
      {saveResult && (
        <div className="card p-6 mb-5 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-xl font-bold text-green-700 mb-1">Import Complete</h2>
          <p className="text-gray-600 text-sm">
            {saveResult.saved} contribution{saveResult.saved !== 1 ? 's' : ''} saved.
            Receipt numbers: {saveResult.receiptNumbers.join(', ')}.
          </p>
          <button
            className="btn-primary mt-5"
            onClick={() => { setSaveResult(null); resetImport() }}
          >
            Import Another File
          </button>
        </div>
      )}

      {/* Preview table */}
      {previewRows.length > 0 && (
        <div className="card overflow-hidden mb-5">
          {/* Table header with summary */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-gray-800">
                {previewRows.length} transaction{previewRows.length !== 1 ? 's' : ''} found
                {fileName && <span className="text-gray-400 font-normal ml-2">— {fileName}</span>}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {readyRows.length} ready to import &nbsp;·&nbsp;
                {unmatchedCount} need attention &nbsp;·&nbsp;
                {ignoredCount} ignored
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" onClick={resetImport}>Cancel</button>
              <button
                className="btn-primary"
                disabled={saving || readyRows.length === 0}
                onClick={handleSave}
              >
                {saving ? 'Saving…' : `Import ${readyRows.length} Record${readyRows.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bcs-light border-b border-gray-100">
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Payer</th>
                  <th className="table-th">Amount</th>
                  <th className="table-th">Description</th>
                  <th className="table-th">Match</th>
                  <th className="table-th min-w-[200px]">Assign Member</th>
                  <th className="table-th text-center">Ignore</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {previewRows.map((r) => {
                  const isIgnored = selections[r.rowIndex] === 'ignore'
                  const assigned  = selections[r.rowIndex] && selections[r.rowIndex] !== 'ignore'
                    ? selections[r.rowIndex] : null

                  return (
                    <tr
                      key={r.rowIndex}
                      className={`transition-colors ${
                        isIgnored ? 'opacity-40 bg-gray-50' :
                        assigned  ? 'hover:bg-bcs-light' :
                        'bg-yellow-50 hover:bg-yellow-100'
                      }`}
                    >
                      <td className="table-td text-xs text-gray-500 whitespace-nowrap">{r.txDate}</td>
                      <td className="table-td">
                        <div className="font-medium text-gray-800 leading-tight">{r.name || '—'}</div>
                        <div className="text-xs text-blue-600">{r.email || '—'}</div>
                        {r.matchConfidence === 'none' && (r.address1 || r.city) && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {[r.address1, r.city, r.state, r.zip].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="table-td font-semibold text-green-700 whitespace-nowrap">
                        ${r.amount.toFixed(2)}
                      </td>
                      <td className="table-td text-xs text-gray-500 max-w-[180px]">
                        <span className="line-clamp-2">{r.description || '—'}</span>
                      </td>
                      <td className="table-td">
                        <MatchBadge confidence={r.matchConfidence} />
                      </td>
                      <td className="table-td">
                        {isIgnored ? (
                          <span className="text-xs text-gray-400 italic">ignored</span>
                        ) : (
                          <MemberPicker
                            value={assigned}
                            onChange={(m) => setRowMember(r.rowIndex, m)}
                            placeholder={r.matchedMemberName || 'Search member…'}
                          />
                        )}
                      </td>
                      <td className="table-td text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-bcs-primary cursor-pointer"
                          checked={isIgnored}
                          onChange={() => toggleIgnore(r.rowIndex)}
                          title="Ignore this transaction"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom action bar */}
          {unmatchedCount > 0 && !saving && (
            <div className="px-5 py-3 bg-yellow-50 border-t border-yellow-100 text-xs text-yellow-800">
              ⚠️ <strong>{unmatchedCount}</strong> transaction{unmatchedCount !== 1 ? 's' : ''} {unmatchedCount === 1 ? 'has' : 'have'} no matching member.
              Use the search box to assign a member, or check Ignore to skip.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
