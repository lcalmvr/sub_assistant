import React, { useState, useEffect } from 'react'
import apiClient from '../api/client'

const Settings = () => {
  const [designees, setDesignees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDesigneeEmail, setNewDesigneeEmail] = useState('')

  useEffect(() => {
    loadDesignees()
  }, [])

  const loadDesignees = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiClient.get('/api/broker/designees')
      setDesignees(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load designees')
    } finally {
      setLoading(false)
    }
  }

  const handleAddDesignee = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    try {
      await apiClient.post('/api/broker/designees', {
        email: newDesigneeEmail,
        can_view_submissions: true
      })
      setMessage('Designee added successfully')
      setNewDesigneeEmail('')
      setShowAddForm(false)
      loadDesignees()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add designee')
    }
  }

  const handleRemoveDesignee = async (designeeId) => {
    if (!window.confirm('Are you sure you want to remove this designee?')) {
      return
    }

    setError('')
    setMessage('')

    try {
      await apiClient.delete(`/api/broker/designees/${designeeId}`)
      setMessage('Designee removed successfully')
      loadDesignees()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove designee')
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString()
  }

  if (loading) {
    return <div className="loading">Loading settings...</div>
  }

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>Settings</h1>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>Designees</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn btn-primary"
          >
            {showAddForm ? 'Cancel' : 'Add Designee'}
          </button>
        </div>

        <p style={{ marginBottom: '20px', color: '#666' }}>
          Designees are users who can view your submissions. They will have read-only access to your accounts.
        </p>

        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}

        {showAddForm && (
          <form onSubmit={handleAddDesignee} style={{ marginBottom: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '4px' }}>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={newDesigneeEmail}
                onChange={(e) => setNewDesigneeEmail(e.target.value)}
                placeholder="designee@example.com"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">Add Designee</button>
          </form>
        )}

        {designees.length === 0 ? (
          <p style={{ color: '#666' }}>No designees added yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Permissions</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {designees.map((designee) => (
                <tr key={designee.id}>
                  <td>{designee.name}</td>
                  <td>{designee.email}</td>
                  <td>
                    {designee.can_view_submissions && (
                      <span className="badge badge-info">Can View Submissions</span>
                    )}
                  </td>
                  <td>{formatDate(designee.created_at)}</td>
                  <td>
                    <button
                      onClick={() => handleRemoveDesignee(designee.id)}
                      className="btn btn-danger"
                      style={{ padding: '5px 10px', fontSize: '12px' }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Settings

