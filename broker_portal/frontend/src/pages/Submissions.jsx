import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../api/client'
import StatusBadge from '../components/StatusBadge'

const Submissions = () => {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('')

  useEffect(() => {
    loadSubmissions()
  }, [statusFilter, outcomeFilter])

  const loadSubmissions = async () => {
    setLoading(true)
    setError('')

    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      if (outcomeFilter) params.outcome = outcomeFilter

      const response = await apiClient.get('/api/broker/submissions', { params })
      setSubmissions(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value) => {
    if (!value) return '—'
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
    return <div className="loading">Loading submissions...</div>
  }

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>Submissions</h1>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="received">Received</option>
              <option value="pending_info">Pending Info</option>
              <option value="quoted">Quoted</option>
              <option value="declined">Declined</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
            <label>Outcome</label>
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
            >
              <option value="">All Outcomes</option>
              <option value="pending">Pending</option>
              <option value="bound">Bound</option>
              <option value="lost">Lost</option>
              <option value="declined">Declined</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {submissions.length === 0 ? (
        <div className="card">
          <p>No submissions found.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Status</th>
                <th>Outcome</th>
                <th>Date Received</th>
                <th>Premium</th>
                <th>Limit</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
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
                  <td>{formatCurrency(submission.policy_limit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Submissions



