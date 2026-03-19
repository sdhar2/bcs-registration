import { NavLink, useNavigate } from 'react-router-dom'

const navItems = [
  { to: '/members', label: 'Members', icon: '👥' },
  { to: '/events', label: 'Events', icon: '📅' },
  { to: '/contributions', label: 'Contributions', icon: '💰' },
]

export default function Navbar() {
  const navigate = useNavigate()

  const handleLogout = () => {
    localStorage.removeItem('bcs_token')
    navigate('/login')
  }

  return (
    <nav className="bg-bcs-primary shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-bcs-primary flex items-center justify-center shadow border-2 border-bcs-accent flex-shrink-0">
              <svg viewBox="0 0 80 80" width="34" height="34" xmlns="http://www.w3.org/2000/svg">
                <text x="40" y="44" fontFamily="Georgia, serif" fontSize="28" fontWeight="bold"
                      fill="white" textAnchor="middle" dominantBaseline="middle">BCS</text>
              </svg>
            </div>
            <div>
              <span className="text-white font-bold text-base leading-tight block">Bengali Cultural Society</span>
              <span className="text-bcs-accent text-xs">Registration Portal</span>
            </div>
          </div>

          {/* Nav Links */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-white text-bcs-primary'
                      : 'text-bcs-accent hover:bg-bcs-dark hover:text-white'
                  }`
                }
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}

            <button
              onClick={handleLogout}
              className="ml-4 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                         text-bcs-accent hover:bg-bcs-dark hover:text-white transition-colors duration-150"
            >
              <span>🚪</span> Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
