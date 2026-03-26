import { useState, useEffect, useCallback } from 'react'
import { getEvents, createEvent, updateEvent, deleteEvent } from '../api'

const EMPTY_FORM = { eventName: '', eventDate: '' }

function EventModal({ event, onClose, onSaved }) {
  const [form, setForm] = useState(
    event
      ? { eventName: event.eventName, eventDate: event.eventDate }
      : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (event) {
        await updateEvent(event.eventId, form)
      } else {
        await createEvent(form)
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-bcs-primary">{event ? 'Edit Event' : 'Add Event'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Event Name *</label>
            <input
              className="input-field"
              value={form.eventName}
              onChange={set('eventName')}
              maxLength={100}
              required
              placeholder="e.g. Durga Puja 2024"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Event Date *</label>
            <input
              className="input-field"
              type="date"
              value={form.eventDate}
              onChange={set('eventDate')}
              required
            />
          </div>

          <div className="flex gap-3 pt-2 justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : event ? 'Save Changes' : 'Add Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ConfirmDelete({ name, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-2">Delete Event?</h3>
        <p className="text-gray-500 text-sm mb-6">
          Are you sure you want to delete <strong>{name}</strong>? All associated contributions will also be deleted.
        </p>
        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function formatDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })
}

export default function Events() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalEvent, setModalEvent] = useState(undefined)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const fetchEvents = useCallback(async () => {
    try {
      const { data } = await getEvents()
      setEvents(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const handleSaved = () => {
    setModalEvent(undefined)
    fetchEvents()
  }

  const handleDelete = async () => {
    try {
      await deleteEvent(deleteTarget.eventId)
      setDeleteTarget(null)
      fetchEvents()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bcs-primary">Events</h1>
          <p className="text-gray-500 text-sm mt-0.5">{events.length} total events</p>
        </div>
        <button className="btn-primary" onClick={() => setModalEvent(null)}>
          + Add Event
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading events…</div>
        ) : events.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No events yet. Add your first event!</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-bcs-light border-b border-gray-100">
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Event Name</th>
                  <th className="table-th">Event Date</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {events.map((ev, idx) => (
                  <tr key={ev.eventId} className="hover:bg-bcs-light transition-colors">
                    <td className="table-td text-gray-400">{idx + 1}</td>
                    <td className="table-td font-semibold text-gray-800">
                      <span className="mr-2">📅</span>{ev.eventName}
                    </td>
                    <td className="table-td">{formatDate(ev.eventDate)}</td>
                    <td className="table-td">
                      <div className="flex gap-2">
                        <button className="btn-secondary btn-sm" onClick={() => setModalEvent(ev)}>Edit</button>
                        <button className="btn-danger btn-sm" onClick={() => setDeleteTarget(ev)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalEvent !== undefined && (
        <EventModal event={modalEvent} onClose={() => setModalEvent(undefined)} onSaved={handleSaved} />
      )}
      {deleteTarget && (
        <ConfirmDelete
          name={deleteTarget.eventName}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
