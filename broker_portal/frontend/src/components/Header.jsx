import React from 'react'
import { Link, useNavigate } from 'react-router-dom'

const Header = () => {
  const navigate = useNavigate()
  const brokerInfo = JSON.parse(localStorage.getItem('broker_info') || '{}')
  
  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('broker_info')
    navigate('/login')
  }
  
  return (
    <header style={{
      background: 'white',
      borderBottom: '1px solid #ddd',
      padding: '15px 0',
      marginBottom: '20px'
    }}>
      <div className="container" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <Link to="/" style={{ textDecoration: 'none', color: '#333', fontSize: '20px', fontWeight: 'bold' }}>
            Broker Portal
          </Link>
        </div>
        <nav style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <Link to="/" style={{ textDecoration: 'none', color: '#333' }}>Dashboard</Link>
          <Link to="/submissions" style={{ textDecoration: 'none', color: '#333' }}>Submissions</Link>
          <Link to="/statistics" style={{ textDecoration: 'none', color: '#333' }}>Statistics</Link>
          <Link to="/settings" style={{ textDecoration: 'none', color: '#333' }}>Settings</Link>
          <span style={{ color: '#666' }}>{brokerInfo.name || brokerInfo.email}</span>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '5px 15px' }}>
            Logout
          </button>
        </nav>
      </div>
    </header>
  )
}

export default Header

