import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './components/Login'
import Navbar from './components/Navbar'
import Members from './components/Members'
import Events from './components/Events'
import Contributions from './components/Contributions'
import ImportTransactions from './components/ImportTransactions'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('bcs_token')
  return token ? children : <Navigate to="/login" replace />
}

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-bcs-light">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/members"
          element={
            <PrivateRoute>
              <Layout><Members /></Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/events"
          element={
            <PrivateRoute>
              <Layout><Events /></Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/contributions"
          element={
            <PrivateRoute>
              <Layout><Contributions /></Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/import"
          element={
            <PrivateRoute>
              <Layout><ImportTransactions /></Layout>
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/members" replace />} />
        <Route path="*" element={<Navigate to="/members" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
