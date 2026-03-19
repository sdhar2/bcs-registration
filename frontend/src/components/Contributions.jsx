import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getContributions, createContribution, updateContribution, deleteContribution,
  searchMembers, getEvents, getReceiptPreview, sendReceipt,
} from '../api'

const today = () => new Date().toISOString().split('T')[0]

const EMPTY_FORM = {
  personId: '', eventId: '', dateEntered: today(),
  contributionAmount: '', notes: '', receiptNumber: '',
}

// ── Member Search Input ───────────────────────────────────────────────────────

function MemberSearch({ value, onChange, onSelect }) {
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  const handleInput = (e) => {
    const q = e.target.value
    onChange(q)
    setOpen(true)
    clearTimeout(debounceRef.current)
    if (q.length < 1) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await searchMembers(q)
        setResults(data)
      } catch { setResults([]) }
      setLoading(false)
    }, 300)
  }

  const pick = (m) => {
    onSelect(m)
    setOpen(false)
    setResults([])
  }

  return (
    <div className="relative">
      <input
        className="input-field"
        placeholder="Type first or last name…"
        value={value}
        onChange={handleInput}
        onFocus={() => value.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        autoComplete="off"
      />
      {open && (value.length > 0) && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
          {loading && <div className="p-3 text-sm text-gray-400">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="p-3 text-sm text-gray-400">No members found</div>
          )}
          {results.map((m) => (
            <div
              key={m.personId}
              className="p-3 hover:bg-bcs-light cursor-pointer border-b border-gray-50 last:border-0"
              onMouseDown={() => pick(m)}
            >
              <div className="font-medium text-sm text-gray-800">
                {m.lastName}, {m.firstName} {m.middleName ? m.middleName[0] + '.' : ''}
              </div>
              <div className="text-xs text-gray-500">{m.email || m.cellPhone || `ID #${m.personId}`}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Contribution Modal ────────────────────────────────────────────────────────

function ContributionModal({ contribution, events, onClose, onSaved }) {
  const [form, setForm] = useState(
    contribution
      ? {
          personId: contribution.personId,
          eventId: contribution.eventId,
          dateEntered: contribution.dateEntered,
          contributionAmount: contribution.contributionAmount ?? '',
          notes: contribution.notes ?? '',
          receiptNumber: contribution.receiptNumber ?? '',
        }
      : { ...EMPTY_FORM }
  )
  const [memberSearch, setMemberSearch] = useState(
    contribution ? contribution.memberName || '' : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleMemberSelect = (m) => {
    setMemberSearch(`${m.lastName}, ${m.firstName}`)
    setForm((f) => ({ ...f, personId: m.personId }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.personId) { setError('Please select a member.'); return }
    if (!form.eventId) { setError('Please select an event.'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        personId: Number(form.personId),
        eventId: Number(form.eventId),
        contributionAmount: form.contributionAmount === '' ? null : parseFloat(form.contributionAmount),
        notes: form.notes || null,
        receiptNumber: form.receiptNumber || null,
      }
      if (contribution) {
        await updateContribution(contribution.contributionId, payload)
      } else {
        await createContribution(payload)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-bcs-primary">
            {contribution ? 'Edit Contribution' : 'Add Contribution'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

          {/* Member Search */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Member *</label>
            {contribution ? (
              <input className="input-field bg-gray-50 cursor-not-allowed" value={memberSearch} readOnly />
            ) : (
              <MemberSearch
                value={memberSearch}
                onChange={setMemberSearch}
                onSelect={handleMemberSelect}
              />
            )}
            {form.personId && (
              <p className="text-xs text-green-600 mt-1">✓ Member ID #{form.personId} selected</p>
            )}
          </div>

          {/* Event Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Event *</label>
            <select
              className="input-field"
              value={form.eventId}
              onChange={set('eventId')}
              required
            >
              <option value="">— Select an event —</option>
              {events.map((ev) => (
                <option key={ev.eventId} value={ev.eventId}>
                  {ev.eventName} ({ev.eventDate})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Date Entered *</label>
              <input
                className="input-field"
                type="date"
                value={form.dateEntered}
                onChange={set('dateEntered')}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Amount ($)</label>
              <input
                className="input-field"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.contributionAmount}
                onChange={set('contributionAmount')}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Receipt Number
              <span className="ml-1 text-xs text-gray-400 font-normal">(auto-assigned if blank)</span>
            </label>
            <input
              className="input-field"
              value={form.receiptNumber}
              onChange={set('receiptNumber')}
              maxLength={15}
              placeholder="e.g. 2025/1 — leave blank to auto-assign"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              className="input-field resize-none"
              rows={3}
              value={form.notes}
              onChange={set('notes')}
              maxLength={200}
              placeholder="Optional notes…"
            />
          </div>

          <div className="flex gap-3 pt-2 justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : contribution ? 'Save Changes' : 'Add Contribution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Send Receipt Dialog ───────────────────────────────────────────────────────

function SendReceiptDialog({ contribution, onClose }) {
  const [preview, setPreview]   = useState(null)   // { emails, receiptNumber, memberName }
  const [loadErr, setLoadErr]   = useState('')
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [sendErr, setSendErr]   = useState('')

  useEffect(() => {
    getReceiptPreview(contribution.contributionId)
      .then(({ data }) => setPreview(data))
      .catch((err) => setLoadErr(err.response?.data?.detail || 'Could not load receipt info.'))
  }, [contribution.contributionId])

  const handleSend = async () => {
    setSending(true)
    setSendErr('')
    try {
      await sendReceipt(contribution.contributionId)
      setSent(true)
    } catch (err) {
      setSendErr(err.response?.data?.detail || 'Email delivery failed.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-bcs-primary">Send Donation Receipt</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Loading state */}
        {!preview && !loadErr && (
          <div className="py-8 text-center text-gray-400 text-sm">Loading receipt info…</div>
        )}

        {/* Error loading preview */}
        {loadErr && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">
            {loadErr}
          </div>
        )}

        {/* Success state */}
        {sent && (
          <div className="py-4">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm mb-4">
              ✓ Receipt emailed successfully to <strong>{preview?.emails?.join(', ')}</strong>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {/* Confirmation state */}
        {preview && !sent && (
          <>
            <div className="space-y-3 mb-5">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Member</span>
                  <span className="font-medium text-gray-800">{preview.memberName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Receipt #</span>
                  <span className="font-mono font-semibold text-bcs-primary">{preview.receiptNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-semibold text-green-700">
                    ${Number(contribution.contributionAmount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Event</span>
                  <span className="text-gray-700">{contribution.eventName}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Will be sent to:</p>
                <div className="flex flex-wrap gap-1">
                  {preview.emails.map((email) => (
                    <span
                      key={email}
                      className="bg-blue-50 text-blue-700 border border-blue-100 text-xs rounded-full px-3 py-1"
                    >
                      {email}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {sendErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm mb-4">
                {sendErr}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
              <button className="btn-primary" onClick={handleSend} disabled={sending}>
                {sending ? 'Sending…' : '📧 Send Receipt'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Confirm Delete ────────────────────────────────────────────────────────────

function ConfirmDelete({ info, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-2">Delete Contribution?</h3>
        <p className="text-gray-500 text-sm mb-6">
          Delete the ${Number(info.contributionAmount || 0).toFixed(2)} contribution from <strong>{info.memberName}</strong> for <strong>{info.eventName}</strong>?
        </p>
        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Contributions() {
  const [contributions, setContributions] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterEvent, setFilterEvent] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [modalContrib, setModalContrib] = useState(undefined)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [receiptTarget, setReceiptTarget] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, eRes] = await Promise.all([
        getContributions(filterEvent ? { event_id: filterEvent } : {}),
        getEvents(),
      ])
      setContributions(cRes.data)
      setEvents(eRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filterEvent])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSaved = () => {
    setModalContrib(undefined)
    fetchAll()
  }

  const handleDelete = async () => {
    try {
      await deleteContribution(deleteTarget.contributionId)
      setDeleteTarget(null)
      fetchAll()
    } catch (e) {
      console.error(e)
    }
  }

  const filtered = contributions.filter((c) => {
    if (!memberFilter) return true
    return c.memberName?.toLowerCase().includes(memberFilter.toLowerCase())
  })

  const totalAmount = filtered.reduce((sum, c) => sum + (Number(c.contributionAmount) || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bcs-primary">Contributions</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} records · Total: <strong>${totalAmount.toFixed(2)}</strong></p>
        </div>
        <button className="btn-primary" onClick={() => setModalContrib(null)}>
          + Add Contribution
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filter by Event</label>
          <select
            className="input-field"
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
          >
            <option value="">All Events</option>
            {events.map((ev) => (
              <option key={ev.eventId} value={ev.eventId}>{ev.eventName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filter by Member Name</label>
          <input
            className="input-field"
            placeholder="Type a name…"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading contributions…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No contributions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-bcs-light border-b border-gray-100">
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Member</th>
                  <th className="table-th">Event</th>
                  <th className="table-th">Amount</th>
                  <th className="table-th">Receipt #</th>
                  <th className="table-th">Notes</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => (
                  <tr key={c.contributionId} className="hover:bg-bcs-light transition-colors">
                    <td className="table-td text-gray-500">{c.dateEntered}</td>
                    <td className="table-td font-medium">{c.memberName || `ID #${c.personId}`}</td>
                    <td className="table-td">
                      <span className="text-bcs-secondary font-medium">{c.eventName || `ID #${c.eventId}`}</span>
                    </td>
                    <td className="table-td">
                      <span className="font-semibold text-green-700">
                        {c.contributionAmount != null ? `$${Number(c.contributionAmount).toFixed(2)}` : '—'}
                      </span>
                    </td>
                    <td className="table-td font-mono text-xs">{c.receiptNumber || '—'}</td>
                    <td className="table-td max-w-xs truncate text-gray-500">{c.notes || '—'}</td>
                    <td className="table-td">
                      <div className="flex gap-1 flex-wrap">
                        <button className="btn-secondary btn-sm" onClick={() => setModalContrib(c)}>Edit</button>
                        <button
                          className="btn-sm px-2 py-1 text-xs rounded font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                          onClick={() => setReceiptTarget(c)}
                          title="Send receipt by email"
                        >
                          📧 Receipt
                        </button>
                        <button className="btn-danger btn-sm" onClick={() => setDeleteTarget(c)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-bcs-light border-t-2 border-bcs-accent">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Total:</td>
                  <td className="px-4 py-3 text-sm font-bold text-green-700">${totalAmount.toFixed(2)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modalContrib !== undefined && (
        <ContributionModal
          contribution={modalContrib}
          events={events}
          onClose={() => setModalContrib(undefined)}
          onSaved={handleSaved}
        />
      )}
      {deleteTarget && (
        <ConfirmDelete
          info={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {receiptTarget && (
        <SendReceiptDialog
          contribution={receiptTarget}
          onClose={() => setReceiptTarget(null)}
        />
      )}
    </div>
  )
}
