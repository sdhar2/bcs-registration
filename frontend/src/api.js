import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

// Attach JWT token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bcs_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redirect to login on 401 — but not for the login endpoint itself,
// otherwise a wrong password would refresh the page before the error displays.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginRequest = err.config?.url === '/auth/login'
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('bcs_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ─────────────────────────────────────────────────────────────────────

export const login = (username, password) =>
  api.post('/auth/login', { username, password })

// ── Members ──────────────────────────────────────────────────────────────────

export const getMembers = () => api.get('/members/')
export const getMember = (id) => api.get(`/members/${id}`)
export const searchMembers = (q) => api.get('/members/search', { params: { q } })
export const checkDuplicate = (firstName, lastName) =>
  api.get('/members/check-duplicate', { params: { first_name: firstName, last_name: lastName } })
export const createMember = (data) => api.post('/members/', data)
export const updateMember = (id, data) => api.put(`/members/${id}`, data)
export const deleteMember = (id) => api.delete(`/members/${id}`)

// ── Events ────────────────────────────────────────────────────────────────────

export const getEvents = () => api.get('/events/')
export const getEvent = (id) => api.get(`/events/${id}`)
export const createEvent = (data) => api.post('/events/', data)
export const updateEvent = (id, data) => api.put(`/events/${id}`, data)
export const deleteEvent = (id) => api.delete(`/events/${id}`)

// ── Contributions ─────────────────────────────────────────────────────────────

export const getContributions = (params) => api.get('/contributions/', { params })
export const createContribution = (data) => api.post('/contributions/', data)
export const updateContribution = (id, data) => api.put(`/contributions/${id}`, data)
export const deleteContribution = (id) => api.delete(`/contributions/${id}`)

// ── Receipt ───────────────────────────────────────────────────────────────────

export const getReceiptPreview = (id) => api.get(`/receipt/preview/${id}`)
export const sendReceipt = (id) => api.post(`/receipt/send/${id}`)

export default api
