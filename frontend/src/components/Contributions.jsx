import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  getContributions, createContribution, updateContribution, deleteContribution,
  searchMembers, getEvents, getReceiptPreview, sendReceipt,
  getBulkReceiptPreview, sendBulkReceipts, getMembershipStatus,
} from '../api'

const today = () => new Date().toISOString().split('T')[0]

const EMPTY_FORM = {
  personId: '', eventId: '', dateEntered: today(),
  contributionAmount: '', notes: '', receiptNumber: '',
}

// Must match MAX_BULK in backend/app/routers/receipt.py
const MAX_BULK = 50
const PAGE_SIZE = 100

const money = (v) => `$${Number(v || 0).toFixed(2)}`

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

  // Membership dues check — runs when a member is picked on a new contribution.
  // Purely informational: it never blocks the save.
  const [membership, setMembership] = useState(null)
  const [membershipLoading, setMembershipLoading] = useState(false)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleMemberSelect = async (m) => {
    setMemberSearch(`${m.lastName}, ${m.firstName}`)
    setForm((f) => ({ ...f, personId: m.personId }))
    setMembership(null)
    setMembershipLoading(true)
    try {
      const { data } = await getMembershipStatus(m.personId)
      setMembership(data)
    } catch {
      // A failed check must never stand in the way of recording a contribution.
      setMembership(null)
    } finally {
      setMembershipLoading(false)
    }
  }

  // Clearing or retyping the member name invalidates the previous check.
  const handleMemberSearchChange = (q) => {
    setMemberSearch(q)
    if (membership) setMembership(null)
    setForm((f) => (f.personId ? { ...f, personId: '' } : f))
  }

  // Once the membership event itself is chosen, the dues are being collected
  // right here, so the warning has served its purpose.
  const payingMembershipNow = useMemo(
    () =>
      !!membership &&
      membership.events.some((ev) => String(ev.eventId) === String(form.eventId)),
    [membership, form.eventId]
  )

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
        const { data } = await updateContribution(contribution.contributionId, payload)
        onSaved(data, false)
      } else {
        const { data } = await createContribution(payload)
        // Hand the saved record back so the caller can chain into the
        // receipt screen — the contribution is already persisted at this point.
        onSaved(data, true)
      }
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
                onChange={handleMemberSearchChange}
                onSelect={handleMemberSelect}
              />
            )}
            {form.personId && (
              <p className="text-xs text-green-600 mt-1">✓ Member ID #{form.personId} selected</p>
            )}

            {/* Membership dues check */}
            {membershipLoading && (
              <p className="text-xs text-gray-400 mt-1">Checking membership…</p>
            )}

            {membership?.lifeMember && (
              <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                ★ Life Member
              </span>
            )}

            {membership?.dues && !payingMembershipNow && (
              <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-3 py-2 text-sm">
                <span aria-hidden="true">⚠️</span>
                <span>
                  <strong>{membership.year} membership is due</strong> for{' '}
                  {membership.memberName}. You can continue entering this
                  contribution — this is a reminder only.
                </span>
              </div>
            )}

            {membership?.dues && payingMembershipNow && (
              <p className="text-xs text-green-700 mt-2">
                ✓ This entry records {membership.memberName}'s {membership.year} membership.
              </p>
            )}

            {membership && !membership.lifeMember && !membership.dues && membership.paid && (
              <p className="text-xs text-green-700 mt-2">
                ✓ {membership.year} membership already paid.
              </p>
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

          {!contribution && (
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
              After saving you'll see the member's email addresses and can send the receipt.
            </p>
          )}

          <div className="flex gap-3 pt-2 justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : contribution ? 'Save Changes' : 'Save & Continue →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Send Receipt Screen (single) ──────────────────────────────────────────────

function SendReceiptDialog({ contribution, justCreated = false, onClose }) {
  const [preview, setPreview]   = useState(null)   // { emails, receiptNumber, memberName, … }
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
          <h2 className="text-lg font-bold text-bcs-primary">
            {justCreated ? 'Contribution Saved — Send Receipt' : 'Send Donation Receipt'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {justCreated && !sent && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-2 rounded text-sm mb-4">
            ✓ Contribution saved{preview?.receiptNumber ? ` as receipt ${preview.receiptNumber}` : ''}.
          </div>
        )}

        {/* Loading state */}
        {!preview && !loadErr && (
          <div className="py-8 text-center text-gray-400 text-sm">Loading receipt info…</div>
        )}

        {/* Error loading preview — e.g. member has no email on file */}
        {loadErr && (
          <>
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm mb-4">
              {loadErr}
              {justCreated && ' The contribution itself was saved.'}
            </div>
            <div className="flex justify-end">
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {/* Success state */}
        {sent && (
          <div className="py-4">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm mb-4">
              ✓ Receipt emailed successfully to <strong>{preview?.emails?.join(', ')}</strong>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={onClose}>Done</button>
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
                    {money(preview.amount ?? contribution.contributionAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Event</span>
                  <span className="text-gray-700">{preview.eventName || contribution.eventName}</span>
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
              <button className="btn-secondary" onClick={onClose} disabled={sending}>
                {justCreated ? 'Skip for now' : 'Cancel'}
              </button>
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

// ── Bulk Receipt Screen ───────────────────────────────────────────────────────

const STATUS_STYLE = {
  sent:    'bg-green-50 text-green-700 border-green-200',
  skipped: 'bg-amber-50 text-amber-700 border-amber-200',
  failed:  'bg-red-50 text-red-700 border-red-200',
}

function BulkReceiptDialog({ ids, onClose, onFinished }) {
  const [preview, setPreview] = useState(null)   // BulkPreviewResponse
  const [loadErr, setLoadErr] = useState('')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null)   // BulkSendResponse
  const [sendErr, setSendErr] = useState('')

  const tooMany = ids.length > MAX_BULK

  useEffect(() => {
    if (tooMany) return
    getBulkReceiptPreview(ids)
      .then(({ data }) => setPreview(data))
      .catch((err) => setLoadErr(err.response?.data?.detail || 'Could not load receipt info.'))
    // ids is a stable snapshot taken when the dialog opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = async () => {
    setSending(true)
    setSendErr('')
    try {
      const { data } = await sendBulkReceipts(ids)
      setResults(data)
      onFinished?.()
    } catch (err) {
      setSendErr(err.response?.data?.detail || 'Bulk send failed.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !sending && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-bcs-primary">
            {results ? 'Bulk Receipts Sent' : `Send ${ids.length} Receipt${ids.length === 1 ? '' : 's'}`}
          </h2>
          <button
            onClick={onClose}
            disabled={sending}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none disabled:opacity-30"
          >
            &times;
          </button>
        </div>

        {tooMany && (
          <>
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded text-sm mb-4">
              You selected {ids.length} contributions. Receipts go out one email at a time,
              so send at most <strong>{MAX_BULK}</strong> per batch. Deselect some and try again.
            </div>
            <div className="flex justify-end">
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {!tooMany && !preview && !loadErr && !results && (
          <div className="py-10 text-center text-gray-400 text-sm">Loading recipients…</div>
        )}

        {loadErr && (
          <>
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{loadErr}</div>
            <div className="flex justify-end"><button className="btn-secondary" onClick={onClose}>Close</button></div>
          </>
        )}

        {/* ── Confirmation: who gets what ── */}
        {preview && !results && (
          <>
            <div className="flex gap-3 mb-3 text-sm">
              <span className="bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1">
                {preview.sendableCount} will be sent
              </span>
              {preview.skippedCount > 0 && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1">
                  {preview.skippedCount} will be skipped
                </span>
              )}
            </div>

            <div className="overflow-y-auto border border-gray-100 rounded-lg flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-bcs-light sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Member</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Receipt #</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Sending to</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.items.map((it) => (
                    <tr key={it.contributionId} className={it.sendable ? '' : 'bg-amber-50/40'}>
                      <td className="px-3 py-2 font-medium text-gray-800">
                        {it.memberName || `Contribution #${it.contributionId}`}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{it.receiptNumber || '—'}</td>
                      <td className="px-3 py-2 text-right text-green-700 font-medium">{money(it.amount)}</td>
                      <td className="px-3 py-2">
                        {it.sendable ? (
                          <div className="flex flex-wrap gap-1">
                            {it.emails.map((e) => (
                              <span key={e} className="bg-blue-50 text-blue-700 border border-blue-100 text-xs rounded-full px-2 py-0.5">
                                {e}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-700 text-xs">⚠ Skipped — {it.reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sendErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm mt-3">{sendErr}</div>
            )}

            {sending && (
              <div className="mt-3">
                <div className="h-1.5 w-full bg-gray-100 rounded overflow-hidden">
                  <div className="h-full w-1/3 bg-bcs-primary animate-pulse rounded" />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Sending {preview.sendableCount} email{preview.sendableCount === 1 ? '' : 's'} — this can take a minute. Please keep this window open.
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <button className="btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
              <button
                className="btn-primary"
                onClick={handleSend}
                disabled={sending || preview.sendableCount === 0}
              >
                {sending ? 'Sending…' : `📧 Send ${preview.sendableCount} Receipt${preview.sendableCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}

        {/* ── Results ── */}
        {results && (
          <>
            <div className="flex gap-3 mb-3 text-sm flex-wrap">
              <span className="bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1">
                ✓ {results.sentCount} sent
              </span>
              {results.skippedCount > 0 && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1">
                  ⚠ {results.skippedCount} skipped
                </span>
              )}
              {results.failedCount > 0 && (
                <span className="bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1">
                  ✕ {results.failedCount} failed
                </span>
              )}
            </div>

            <div className="overflow-y-auto border border-gray-100 rounded-lg flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-bcs-light sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Member</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Receipt #</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {results.items.map((it) => (
                    <tr key={it.contributionId}>
                      <td className="px-3 py-2 font-medium text-gray-800">
                        {it.memberName || `Contribution #${it.contributionId}`}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{it.receiptNumber || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs rounded-full px-2 py-0.5 border ${STATUS_STYLE[it.status]}`}>
                          {it.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {it.status === 'sent' ? it.emails.join(', ') : (it.detail || '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4">
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Multi-Event Filter ────────────────────────────────────────────────────────

function EventFilter({ events, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef(null)

  // Close when clicking anywhere outside the panel
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Every whitespace-separated term must appear somewhere, so "durga 2026"
  // matches "2026 Durga Puja — Saturday Dinner" regardless of word order.
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return events
    const terms = needle.split(/\s+/)
    return events.filter((ev) => {
      const hay = `${ev.eventName || ''} ${ev.eventDate || ''}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [events, q])

  const toggle = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  const addAllMatching = () => {
    const next = new Set(selected)
    matches.forEach((ev) => next.add(ev.eventId))
    onChange(next)
  }

  const removeAllMatching = () => {
    const next = new Set(selected)
    matches.forEach((ev) => next.delete(ev.eventId))
    onChange(next)
  }

  const allMatchingSelected =
    matches.length > 0 && matches.every((ev) => selected.has(ev.eventId))

  const selectedEventObjs = events.filter((ev) => selected.has(ev.eventId))

  const label =
    selected.size === 0
      ? 'All Events'
      : selected.size === 1
        ? selectedEventObjs[0]?.eventName || '1 event'
        : `${selected.size} events selected`

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className="input-field text-left flex items-center justify-between gap-2"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected.size === 0 ? 'text-gray-400' : 'text-gray-800 truncate'}>
          {label}
        </span>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1">
          <div className="p-2 border-b border-gray-100">
            <input
              className="input-field text-sm"
              placeholder="Search events — e.g. durga 2026"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between px-3 py-1.5 bg-bcs-light text-xs border-b border-gray-100">
            <span className="text-gray-500">
              {matches.length} event{matches.length === 1 ? '' : 's'}
              {q.trim() && ' matching'}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                className="text-bcs-primary hover:underline disabled:opacity-30 disabled:no-underline"
                onClick={addAllMatching}
                disabled={matches.length === 0 || allMatchingSelected}
              >
                Select all {q.trim() ? 'matching' : ''}
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  className="text-gray-500 hover:underline"
                  onClick={q.trim() ? removeAllMatching : () => onChange(new Set())}
                >
                  {q.trim() ? 'Unselect matching' : 'Clear'}
                </button>
              )}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {matches.length === 0 && (
              <div className="p-3 text-sm text-gray-400">No events match “{q}”.</div>
            )}
            {matches.map((ev) => (
              <label
                key={ev.eventId}
                className="flex items-center gap-2 px-3 py-2 hover:bg-bcs-light cursor-pointer border-b border-gray-50 last:border-0"
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-bcs-primary cursor-pointer shrink-0"
                  checked={selected.has(ev.eventId)}
                  onChange={() => toggle(ev.eventId)}
                />
                <span className="text-sm text-gray-800 flex-1 truncate">{ev.eventName}</span>
                <span className="text-xs text-gray-400 shrink-0">{ev.eventDate}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Selected-event chips */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedEventObjs.map((ev) => (
            <span
              key={ev.eventId}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 text-xs rounded-full pl-3 pr-1 py-1"
            >
              {ev.eventName}
              <button
                type="button"
                className="hover:bg-blue-200 rounded-full w-4 h-4 leading-none text-blue-500"
                onClick={() => toggle(ev.eventId)}
                aria-label={`Remove ${ev.eventName} filter`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
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
          Delete the {money(info.contributionAmount)} contribution from <strong>{info.memberName}</strong> for <strong>{info.eventName}</strong>?
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
  const [selectedEvents, setSelectedEvents] = useState(() => new Set())
  const [memberFilter, setMemberFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [modalContrib, setModalContrib] = useState(undefined)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [receiptTarget, setReceiptTarget] = useState(null)      // { contribution, justCreated }
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkIds, setBulkIds] = useState(null)                  // snapshot passed to the bulk dialog

  // A stable primitive so the fetch/reset effects below don't re-fire on every
  // render just because `selectedEvents` is a new Set object.
  const eventKey = useMemo(
    () => Array.from(selectedEvents).sort((a, b) => a - b).join(','),
    [selectedEvents]
  )
  const hasEventFilter = selectedEvents.size > 0

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page }
      if (eventKey) params.event_ids = eventKey.split(',').map(Number)
      const [cRes, eRes] = await Promise.all([
        getContributions(params),
        getEvents(),
      ])
      setContributions(cRes.data)
      setTotalCount(Number(cRes.headers['x-total-count'] || cRes.data.length))
      setEvents(eRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [eventKey, page])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Reset to page 1 when the event filter changes
  useEffect(() => { setPage(1) }, [eventKey])

  // Clearing the selection when the visible set changes keeps the checkbox
  // state from silently referring to rows that are no longer on screen.
  useEffect(() => { setSelectedIds(new Set()) }, [eventKey, page])

  const handleSaved = (saved, isNew) => {
    setModalContrib(undefined)
    fetchAll()
    if (isNew && saved?.contributionId) {
      setReceiptTarget({ contribution: saved, justCreated: true })
    }
  }

  const handleDelete = async () => {
    try {
      await deleteContribution(deleteTarget.contributionId)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteTarget.contributionId)
        return next
      })
      setDeleteTarget(null)
      fetchAll()
    } catch (e) {
      console.error(e)
    }
  }

  const filtered = useMemo(() => contributions.filter((c) => {
    if (!memberFilter) return true
    return c.memberName?.toLowerCase().includes(memberFilter.toLowerCase())
  }), [contributions, memberFilter])

  const toggleOne = (id) => setSelectedIds((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const visibleIds = filtered.map((c) => c.contributionId)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const toggleAllVisible = () => setSelectedIds((prev) => {
    const next = new Set(prev)
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id))
    else visibleIds.forEach((id) => next.add(id))
    return next
  })

  const selectedCount = selectedIds.size
  const totalAmount = filtered.reduce((sum, c) => sum + (Number(c.contributionAmount) || 0), 0)
  const totalPages = hasEventFilter ? 1 : Math.ceil(totalCount / PAGE_SIZE)
  const isPaginated = !hasEventFilter && totalCount > PAGE_SIZE

  // Per-event subtotals over the rows actually on screen, ordered to match the
  // event dropdown (newest first) rather than by whatever order rows arrived in.
  const perEvent = useMemo(() => {
    if (!hasEventFilter) return []
    const acc = new Map()
    filtered.forEach((c) => {
      const key = c.eventId
      const row = acc.get(key) || { eventId: key, eventName: c.eventName, count: 0, amount: 0 }
      row.count += 1
      row.amount += Number(c.contributionAmount) || 0
      acc.set(key, row)
    })
    return events
      .filter((ev) => acc.has(ev.eventId))
      .map((ev) => ({ ...acc.get(ev.eventId), eventName: ev.eventName }))
  }, [filtered, events, hasEventFilter])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bcs-primary">Contributions</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {hasEventFilter
              ? `${filtered.length.toLocaleString()} records across ${selectedEvents.size} event${selectedEvents.size === 1 ? '' : 's'}`
              : `${totalCount.toLocaleString()} total records`}
            {' · '}Total shown: <strong>{money(totalAmount)}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded-lg font-medium text-sm border transition-colors ${
              selectedCount > 0
                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
            }`}
            disabled={selectedCount === 0}
            onClick={() => setBulkIds(Array.from(selectedIds))}
            title={selectedCount === 0 ? 'Select contributions to send receipts' : `Send ${selectedCount} receipts`}
          >
            📧 Send Bulk Receipts{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
          <button className="btn-primary" onClick={() => setModalContrib(null)}>
            + Add Contribution
          </button>
        </div>
      </div>

      {/* Selection banner */}
      {selectedCount > 0 && (
        <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
          <span className="text-blue-800">
            <strong>{selectedCount}</strong> contribution{selectedCount === 1 ? '' : 's'} selected
            {selectedCount > MAX_BULK && (
              <span className="text-amber-700"> — max {MAX_BULK} per batch</span>
            )}
          </span>
          <button className="text-blue-700 hover:underline" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filter by Event</label>
          <EventFilter
            events={events}
            selected={selectedEvents}
            onChange={setSelectedEvents}
          />
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

      {/* Per-event breakdown — only meaningful once events are picked */}
      {perEvent.length > 1 && (
        <div className="card p-4 mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Breakdown by event</p>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {perEvent.map((ev) => (
              <div key={ev.eventId} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-gray-700 truncate">{ev.eventName}</span>
                <span className="shrink-0">
                  <span className="text-gray-400 text-xs mr-2">{ev.count} rec.</span>
                  <span className="font-semibold text-green-700">{money(ev.amount)}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between gap-3 text-sm border-t border-gray-100 mt-2 pt-2">
            <span className="font-semibold text-gray-700">Combined</span>
            <span className="font-bold text-green-700">{money(totalAmount)}</span>
          </div>
        </div>
      )}

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
                  <th className="table-th w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-bcs-primary cursor-pointer align-middle"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      title="Select all shown"
                    />
                  </th>
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
                {filtered.map((c) => {
                  const checked = selectedIds.has(c.contributionId)
                  return (
                    <tr
                      key={c.contributionId}
                      className={`transition-colors ${checked ? 'bg-blue-50/60' : 'hover:bg-bcs-light'}`}
                    >
                      <td className="table-td">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-bcs-primary cursor-pointer align-middle"
                          checked={checked}
                          onChange={() => toggleOne(c.contributionId)}
                          aria-label={`Select receipt for ${c.memberName || c.personId}`}
                        />
                      </td>
                      <td className="table-td text-gray-500">{c.dateEntered}</td>
                      <td className="table-td font-medium">{c.memberName || `ID #${c.personId}`}</td>
                      <td className="table-td">
                        <span className="text-bcs-secondary font-medium">{c.eventName || `ID #${c.eventId}`}</span>
                      </td>
                      <td className="table-td">
                        <span className="font-semibold text-green-700">
                          {c.contributionAmount != null ? money(c.contributionAmount) : '—'}
                        </span>
                      </td>
                      <td className="table-td font-mono text-xs">{c.receiptNumber || '—'}</td>
                      <td className="table-td max-w-xs truncate text-gray-500">{c.notes || '—'}</td>
                      <td className="table-td">
                        <div className="flex gap-1 flex-wrap">
                          <button className="btn-secondary btn-sm" onClick={() => setModalContrib(c)}>Edit</button>
                          <button
                            className="btn-sm px-2 py-1 text-xs rounded font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                            onClick={() => setReceiptTarget({ contribution: c, justCreated: false })}
                            title="Send receipt by email"
                          >
                            📧 Receipt
                          </button>
                          <button className="btn-danger btn-sm" onClick={() => setDeleteTarget(c)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-bcs-light border-t-2 border-bcs-accent">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">Total:</td>
                  <td className="px-4 py-3 text-sm font-bold text-green-700">{money(totalAmount)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Pagination controls — only shown when browsing all events */}
      {isPaginated && (
        <div className="flex items-center justify-between mt-4 px-1">
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages} · showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button
              className="btn-secondary btn-sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Previous
            </button>
            <button
              className="btn-secondary btn-sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next →
            </button>
          </div>
        </div>
      )}

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
          contribution={receiptTarget.contribution}
          justCreated={receiptTarget.justCreated}
          onClose={() => setReceiptTarget(null)}
        />
      )}
      {bulkIds && (
        <BulkReceiptDialog
          ids={bulkIds}
          onClose={() => setBulkIds(null)}
          onFinished={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  )
}
