import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

const Login = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [devToken, setDevToken] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    setDevToken('')

    try {
      const response = await apiClient.post('/api/broker/auth/magic-link', {
        email: email
      })

      if (response.data.dev_token) {
        // Dev mode: show token and allow direct login
        setDevToken(response.data.dev_token)
        setMessage('Dev mode: Use the token below to login directly')
      } else {
        setMessage('Magic link sent! Check your email and click the link to login.')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send magic link')
    } finally {
      setLoading(false)
    }
  }

  const handleDevLogin = async () => {
    if (!devToken) return

    setLoading(true)
    setError('')

    try {
      const response = await apiClient.post(`/api/broker/auth/callback?token=${devToken}`)

      localStorage.setItem('auth_token', response.data.token)
      localStorage.setItem('broker_info', JSON.stringify(response.data.broker))
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div className="card" style={{ width: '400px' }}>
        <h1 style={{ marginBottom: '20px', textAlign: 'center' }}>Broker Portal</h1>
        <p style={{ marginBottom: '20px', textAlign: 'center', color: '#666' }}>
          Enter your email to receive a magic link
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="broker@example.com"
            />
          </div>

          {error && <div className="error">{error}</div>}
          {message && <div className="success">{message}</div>}

          {devToken && (
            <div style={{ marginTop: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
              <p style={{ fontSize: '12px', marginBottom: '10px' }}>Dev Token:</p>
              <input
                type="text"
                value={devToken}
                readOnly
                style={{ width: '100%', padding: '5px', fontSize: '12px', fontFamily: 'monospace' }}
              />
              <button
                type="button"
                onClick={handleDevLogin}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '10px' }}
                disabled={loading}
              >
                Login with Token
              </button>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login

