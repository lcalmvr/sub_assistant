import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../api/client'
import StatusBadge from '../components/StatusBadge'

const Dashboard = () => {
  const [stats, setStats] = useState(null)
  const [recentSubmissions, setRecentSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const [statsResponse, submissionsResponse] = await Promise.all([
        apiClient.get('/api/broker/stats'),
        apiClient.get('/api/broker/submissions', { params: { limit: 5 } })
      ])
      setStats(statsResponse.data)
      setRecentSubmissions(submissionsResponse.data.slice(0, 5))
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value) => {
    if (!value) return '$0'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatDate = (dateString) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString()
  }

  if (loading) {
    return <div className="loading">Loading dashboard...</div>
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>Dashboard</h1>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div className="card">
            <h3 style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>Total Submissions</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.total_submissions}</p>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>Bound Rate</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.bound_rate.toFixed(1)}%</p>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>Total Premium</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{formatCurrency(stats.total_premium)}</p>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>Average Premium</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{formatCurrency(stats.average_premium)}</p>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2>Recent Submissions</h2>
          <Link to="/submissions" className="btn btn-secondary">View All</Link>
        </div>

        {recentSubmissions.length === 0 ? (
          <p style={{ color: '#666' }}>No submissions yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Status</th>
                <th>Outcome</th>
                <th>Date Received</th>
                <th>Premium</th>
              </tr>
            </thead>
            <tbody>
              {recentSubmissions.map((submission) => (
                <tr key={submission.id}>
                  <td>
                    <Link
                      to={`/submissions/${submission.id}`}
                      style={{ textDecoration: 'none', color: '#007bff' }}
                    >
                      {submission.account_name || submission.applicant_name || 'Unknown'}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={submission.status} />
                  </td>
                  <td>
                    {submission.outcome && (
                      <StatusBadge status={submission.outcome} type="outcome" />
                    )}
                  </td>
                  <td>{formatDate(submission.date_received)}</td>
                  <td>{formatCurrency(submission.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '20px' }}>
        <Link to="/submissions" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', textAlign: 'center' }}>
            <h3>View All Submissions</h3>
            <p style={{ color: '#666' }}>See all your submissions with filters</p>
          </div>
        </Link>

        <Link to="/statistics" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', textAlign: 'center' }}>
            <h3>View Statistics</h3>
            <p style={{ color: '#666' }}>Detailed analytics and charts</p>
          </div>
        </Link>

        <Link to="/settings" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer', textAlign: 'center' }}>
            <h3>Settings</h3>
            <p style={{ color: '#666' }}>Manage designees and preferences</p>
          </div>
        </Link>
      </div>
    </div>
  )
}

export default Dashboard

