import React, { useState, useEffect } from 'react'
import apiClient from '../api/client'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Pie, Bar, Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
)

const Statistics = () => {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const response = await apiClient.get('/api/broker/stats')
      setStats(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load statistics')
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

  if (loading) {
    return <div className="loading">Loading statistics...</div>
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  if (!stats) {
    return <div>No statistics available</div>
  }

  const statusData = {
    labels: Object.keys(stats.submissions_by_status).filter(k => stats.submissions_by_status[k] > 0),
    datasets: [{
      label: 'Submissions by Status',
      data: Object.keys(stats.submissions_by_status)
        .filter(k => stats.submissions_by_status[k] > 0)
        .map(k => stats.submissions_by_status[k]),
      backgroundColor: [
        'rgba(54, 162, 235, 0.6)',
        'rgba(255, 206, 86, 0.6)',
        'rgba(75, 192, 192, 0.6)',
        'rgba(255, 99, 132, 0.6)',
      ],
    }]
  }

  const outcomeData = {
    labels: Object.keys(stats.submissions_by_outcome).filter(k => stats.submissions_by_outcome[k] > 0),
    datasets: [{
      label: 'Submissions by Outcome',
      data: Object.keys(stats.submissions_by_outcome)
        .filter(k => stats.submissions_by_outcome[k] > 0)
        .map(k => stats.submissions_by_outcome[k]),
      backgroundColor: [
        'rgba(75, 192, 192, 0.6)',
        'rgba(255, 99, 132, 0.6)',
        'rgba(255, 206, 86, 0.6)',
        'rgba(153, 102, 255, 0.6)',
      ],
    }]
  }

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>Statistics</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
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

        <div className="card">
          <h3 style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>Average Deal Size</h3>
          <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{formatCurrency(stats.average_deal_size)}</p>
        </div>

        {stats.average_time_to_quote_days && (
          <div className="card">
            <h3 style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>Avg Time to Quote</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.average_time_to_quote_days.toFixed(1)} days</p>
          </div>
        )}

        {stats.average_time_to_bind_days && (
          <div className="card">
            <h3 style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>Avg Time to Bind</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.average_time_to_bind_days.toFixed(1)} days</p>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        <div className="card">
          <h3 style={{ marginBottom: '15px' }}>Submissions by Status</h3>
          {Object.values(stats.submissions_by_status).some(v => v > 0) ? (
            <Pie data={statusData} />
          ) : (
            <p style={{ color: '#666' }}>No data available</p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '15px' }}>Submissions by Outcome</h3>
          {Object.values(stats.submissions_by_outcome).some(v => v > 0) ? (
            <Pie data={outcomeData} />
          ) : (
            <p style={{ color: '#666' }}>No data available</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Statistics



