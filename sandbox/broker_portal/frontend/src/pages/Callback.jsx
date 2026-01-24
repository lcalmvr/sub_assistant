import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import apiClient from '../api/client'

const Callback = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    
    if (!token) {
      setError('No token provided')
      setLoading(false)
      return
    }

    const handleCallback = async () => {
      try {
        const response = await apiClient.post(`/api/broker/auth/callback?token=${token}`)

        localStorage.setItem('auth_token', response.data.token)
        localStorage.setItem('broker_info', JSON.stringify(response.data.broker))
        navigate('/')
      } catch (err) {
        setError(err.response?.data?.detail || 'Invalid or expired magic link')
        setLoading(false)
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh'
      }}>
        <div className="loading">
          <p>Logging you in...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh'
      }}>
        <div className="card" style={{ width: '400px', textAlign: 'center' }}>
          <h2 style={{ color: '#dc3545', marginBottom: '20px' }}>Login Failed</h2>
          <p className="error">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="btn btn-primary"
            style={{ marginTop: '20px' }}
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default Callback

