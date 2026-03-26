import { useState, useEffect, useCallback } from 'react'
import { getMembers, createMember, updateMember, deleteMember, checkDuplicate } from '../api'

const EMPTY_FORM = {
  firstName: '', lastName: '', middleName: '', spouse: '', children: '',
  address1: '', address2: '', city: '', state: '', zip: '',
  homePhone: '', cellPhone: '', cellPhone2: '',
  email: '', status: 'Active', lifeMember: false,
}

const STATUS_OPTIONS = ['Active', 'Inactive', 'Pending']

// ── Valid US state / territory codes ─────────────────────────────────────────
const VALID_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC','PR','VI','GU','MP','AS',
])

// ── Validation regexes ────────────────────────────────────────────────────────
const RE_ALPHA_PARENS  = /^[A-Za-z\s()]*$/          // firstName, middleName, spouse
const RE_ALPHA_ONLY    = /^[A-Za-z\s]*$/             // lastName
const RE_CHILDREN      = /^[A-Za-z\s(),&]*$/         // children
const RE_ZIP           = /^(\d{5}|\d{5}-\d{4})$/     // 12345 or 12345-6789
const RE_PHONE         = /^\d{10}$/                  // exactly 10 digits
const RE_EMAIL_SINGLE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateFields(form) {
  const errors = {}

  if (form.firstName && !RE_ALPHA_PARENS.test(form.firstName))
    errors.firstName = 'Only letters, spaces, ( ) allowed'

  if (form.middleName && !RE_ALPHA_PARENS.test(form.middleName))
    errors.middleName = 'Only letters, spaces, ( ) allowed'

  if (form.lastName && !RE_ALPHA_ONLY.test(form.lastName))
    errors.lastName = 'Only letters and spaces allowed'

  if (form.spouse && !RE_ALPHA_PARENS.test(form.spouse))
    errors.spouse = 'Only letters, spaces, ( ) allowed'

  if (form.children && !RE_CHILDREN.test(form.children))
    errors.children = 'Only letters, spaces, ( ) & , allowed'

  if (form.state) {
    const st = form.state.toUpperCase()
    if (!/^[A-Za-z]{2}$/.test(form.state))
      errors.state = 'Must be 2 letters (e.g. NJ)'
    else if (!VALID_STATES.has(st))
      errors.state = `"${st}" is not a valid state code`
  }

  if (form.zip && !RE_ZIP.test(form.zip))
    errors.zip = 'Must be 5 digits or 12345-6789'

  if (form.homePhone && !RE_PHONE.test(form.homePhone))
    errors.homePhone = 'Must be exactly 10 digits'

  if (form.cellPhone && !RE_PHONE.test(form.cellPhone))
    errors.cellPhone = 'Must be exactly 10 digits'

  if (form.cellPhone2 && !RE_PHONE.test(form.cellPhone2))
    errors.cellPhone2 = 'Must be exactly 10 digits'

  if (form.email) {
    const emails = form.email.split(',').map((e) => e.trim()).filter(Boolean)
    const bad = emails.filter((e) => !RE_EMAIL_SINGLE.test(e))
    if (bad.length > 0)
      errors.email = `Invalid address${bad.length > 1 ? 'es' : ''}: ${bad.join(', ')}`
  }

  return errors
}

// ── Inline field error helper ─────────────────────────────────────────────────
function FieldError({ msg }) {
  if (!msg) return null
  return <p className="text-red-500 text-xs mt-1">{msg}</p>
}

// ── Member Modal ──────────────────────────────────────────────────────────────
function MemberModal({ member, onClose, onSaved }) {
  const [form, setForm] = useState(
    member ? { ...member } : { ...EMPTY_FORM }
  )
  const [fieldErrors, setFieldErrors]         = useState({})
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState('')
  const [duplicates, setDuplicates]           = useState([])   // found duplicate members
  const [pendingPayload, setPendingPayload]   = useState(null) // payload waiting for user confirmation

  const set = (field) => (e) => {
    let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    // Auto-uppercase state
    if (field === 'state') val = val.toUpperCase()
    setForm((f) => ({ ...f, [field]: val }))
    // Clear individual field error on edit
    if (fieldErrors[field])
      setFieldErrors((fe) => ({ ...fe, [field]: undefined }))
  }

  const buildPayload = () => ({
    ...form,
    middleName: form.middleName || null,
    spouse:     form.spouse     || null,
    children:   form.children   || null,
    address1:   form.address1   || null,
    address2:   form.address2   || null,
    city:       form.city       || null,
    state:      form.state      ? form.state.toUpperCase() : null,
    zip:        form.zip        || null,
    homePhone:  form.homePhone  || null,
    cellPhone:  form.cellPhone  || null,
    cellPhone2: form.cellPhone2 || null,
    email:      form.email      || null,
    status:     form.status     || null,
  })

  const doSave = async (payload) => {
    setSaving(true)
    setError('')
    try {
      if (member) {
        await updateMember(member.personId, payload)
      } else {
        await createMember(payload)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validateFields(form)
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      setError('Please fix the highlighted fields before saving.')
      return
    }
    setFieldErrors({})
    setError('')
    const payload = buildPayload()

    // Duplicate check only when creating a new member
    if (!member) {
      try {
        const { data } = await checkDuplicate(form.firstName.trim(), form.lastName.trim())
        if (data.duplicates.length > 0) {
          setDuplicates(data.duplicates)
          setPendingPayload(payload)
          return   // pause — let the user decide
        }
      } catch {
        // If the check fails, proceed with save anyway
      }
    }

    await doSave(payload)
  }

  const inputClass = (field) =>
    `input-field ${fieldErrors[field] ? 'border-red-400 focus:ring-red-300' : ''}`

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-bcs-primary">
            {member ? 'Edit Member' : 'Add Member'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>
          )}

          {/* ── Personal Information ── */}
          <div>
            <h3 className="section-header">Personal Information</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">First Name *</label>
                <input className={inputClass('firstName')} value={form.firstName} onChange={set('firstName')} required />
                <FieldError msg={fieldErrors.firstName} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Middle Name</label>
                <input className={inputClass('middleName')} value={form.middleName} onChange={set('middleName')} />
                <FieldError msg={fieldErrors.middleName} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Last Name *</label>
                <input className={inputClass('lastName')} value={form.lastName} onChange={set('lastName')} required />
                <FieldError msg={fieldErrors.lastName} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Spouse</label>
                <input className={inputClass('spouse')} value={form.spouse} onChange={set('spouse')} />
                <FieldError msg={fieldErrors.spouse} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Children</label>
                <input
                  className={inputClass('children')}
                  value={form.children}
                  onChange={set('children')}
                  placeholder="e.g. Ravi (12), Priya (9)"
                />
                <FieldError msg={fieldErrors.children} />
              </div>
            </div>
          </div>

          {/* ── Address ── */}
          <div>
            <h3 className="section-header">Address</h3>
            <div className="space-y-3">
              <input className="input-field" placeholder="Address Line 1" value={form.address1} onChange={set('address1')} />
              <input className="input-field" placeholder="Address Line 2" value={form.address2} onChange={set('address2')} />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                  <input className="input-field" value={form.city} onChange={set('city')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                  <input
                    className={inputClass('state')}
                    value={form.state}
                    onChange={set('state')}
                    maxLength={2}
                    placeholder="NJ"
                  />
                  <FieldError msg={fieldErrors.state} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Zip</label>
                  <input
                    className={inputClass('zip')}
                    value={form.zip}
                    onChange={set('zip')}
                    maxLength={10}
                    placeholder="08003 or 08003-1234"
                  />
                  <FieldError msg={fieldErrors.zip} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Contact ── */}
          <div>
            <h3 className="section-header">Contact</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Home Phone</label>
                <input
                  className={inputClass('homePhone')}
                  value={form.homePhone}
                  onChange={set('homePhone')}
                  placeholder="6095551234"
                  maxLength={10}
                />
                <FieldError msg={fieldErrors.homePhone} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cell Phone</label>
                <input
                  className={inputClass('cellPhone')}
                  value={form.cellPhone}
                  onChange={set('cellPhone')}
                  placeholder="6095551234"
                  maxLength={10}
                />
                <FieldError msg={fieldErrors.cellPhone} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cell Phone 2</label>
                <input
                  className={inputClass('cellPhone2')}
                  value={form.cellPhone2}
                  onChange={set('cellPhone2')}
                  placeholder="6095551234"
                  maxLength={10}
                />
                <FieldError msg={fieldErrors.cellPhone2} />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Email
                <span className="ml-1 font-normal text-gray-400">(separate multiple addresses with commas)</span>
              </label>
              <input
                className={inputClass('email')}
                type="text"
                value={form.email}
                onChange={set('email')}
                placeholder="e.g. john@example.com, jane@example.com"
              />
              <FieldError msg={fieldErrors.email} />
            </div>
          </div>

          {/* ── Membership ── */}
          <div>
            <h3 className="section-header">Membership</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select className="input-field" value={form.status} onChange={set('status')}>
                  {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-bcs-primary"
                  checked={form.lifeMember}
                  onChange={set('lifeMember')}
                />
                <span className="text-sm font-medium text-gray-700">Life Member</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2 justify-end border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : member ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </form>

        {/* ── Duplicate Warning Dialog ── */}
        {duplicates.length > 0 && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-2xl z-10">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">Duplicate Member Found</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    The following member{duplicates.length > 1 ? 's' : ''} with the same name already exist{duplicates.length === 1 ? 's' : ''}:
                  </p>
                </div>
              </div>
              <ul className="mb-5 space-y-1">
                {duplicates.map((d) => (
                  <li key={d.personId} className="text-sm bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-gray-700">
                    <strong>{d.firstName} {d.lastName}</strong>
                    {(d.city || d.state) && (
                      <span className="text-gray-400 ml-2">
                        — {[d.city, d.state].filter(Boolean).join(', ')}
                      </span>
                    )}
                    <span className="text-gray-400 ml-2">(ID #{d.personId})</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-600 mb-5">Do you still want to save this new record?</p>
              <div className="flex gap-3 justify-end">
                <button
                  className="btn-secondary"
                  onClick={() => { setDuplicates([]); setPendingPayload(null) }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={() => { setDuplicates([]); doSave(pendingPayload) }}
                >
                  Save Anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Confirm Delete ────────────────────────────────────────────────────────────
function ConfirmDelete({ name, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-2">Delete Member?</h3>
        <p className="text-gray-500 text-sm mb-6">
          Are you sure you want to delete <strong>{name}</strong>? This will also delete all their contributions.
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
export default function Members() {
  const [members, setMembers]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [modalMember, setModalMember] = useState(undefined)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await getMembers()
      setMembers(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const handleSaved = () => {
    setModalMember(undefined)
    fetchMembers()
  }

  const handleDelete = async () => {
    try {
      await deleteMember(deleteTarget.personId)
      setDeleteTarget(null)
      fetchMembers()
    } catch (e) {
      console.error(e)
    }
  }

  const filtered = members.filter((m) => {
    if (!search) return true
    const s = search.toLowerCase()
    return m.firstName?.toLowerCase().includes(s) ||
           m.lastName?.toLowerCase().includes(s)  ||
           m.email?.toLowerCase().includes(s)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bcs-primary">Members</h1>
          <p className="text-gray-500 text-sm mt-0.5">{members.length} total members</p>
        </div>
        <button className="btn-primary" onClick={() => setModalMember(null)}>
          + Add Member
        </button>
      </div>

      {/* Search */}
      <div className="card p-4 mb-4 flex gap-3 items-center">
        <span className="text-gray-400">🔍</span>
        <input
          className="flex-1 outline-none text-sm text-gray-700 bg-transparent"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="text-gray-400 hover:text-gray-600 text-sm" onClick={() => setSearch('')}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading members…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            {search ? 'No members match your search.' : 'No members yet. Add your first member!'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-bcs-light border-b border-gray-100">
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Email</th>
                  <th className="table-th">Phone</th>
                  <th className="table-th">City/State</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Life Member</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((m) => (
                  <tr key={m.personId} className="hover:bg-bcs-light transition-colors">
                    <td className="table-td font-medium">
                      {m.lastName}, {m.firstName}
                      {m.middleName ? ` ${m.middleName[0]}.` : ''}
                    </td>
                    <td className="table-td text-blue-600">{m.email || '—'}</td>
                    <td className="table-td">{m.cellPhone || m.homePhone || '—'}</td>
                    <td className="table-td">{[m.city, m.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="table-td">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        m.status === 'Active'   ? 'bg-green-100 text-green-700' :
                        m.status === 'Inactive' ? 'bg-gray-100 text-gray-600'  :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {m.status || '—'}
                      </span>
                    </td>
                    <td className="table-td text-center">{m.lifeMember ? '✅' : '—'}</td>
                    <td className="table-td">
                      <div className="flex gap-2">
                        <button className="btn-secondary btn-sm" onClick={() => setModalMember(m)}>Edit</button>
                        <button className="btn-danger btn-sm"    onClick={() => setDeleteTarget(m)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalMember !== undefined && (
        <MemberModal
          member={modalMember}
          onClose={() => setModalMember(undefined)}
          onSaved={handleSaved}
        />
      )}
      {deleteTarget && (
        <ConfirmDelete
          name={`${deleteTarget.firstName} ${deleteTarget.lastName}`}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
