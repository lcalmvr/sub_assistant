import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import apiClient from '../api/client'
import StatusBadge from '../components/StatusBadge'
import DocumentUpload from '../components/DocumentUpload'

const SubmissionDetail = () => {
  const { id } = useParams()
  const [submission, setSubmission] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadSubmission()
    loadDocuments()
  }, [id])

  const loadSubmission = async () => {
    try {
      const response = await apiClient.get(`/api/broker/submissions/${id}`)
      setSubmission(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load submission')
    } finally {
      setLoading(false)
    }
  }

  const loadDocuments = async () => {
    try {
      const response = await apiClient.get(`/api/broker/submissions/${id}/documents`)
      setDocuments(response.data)
    } catch (err) {
      console.error('Failed to load documents:', err)
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
    return <div className="loading">Loading submission...</div>
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  if (!submission) {
    return <div>Submission not found</div>
  }

  return (
    <div>
      <h1 style={{ marginBottom: '20px' }}>
        {submission.account_name || submission.applicant_name || 'Submission Details'}
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px' }}>
        <div className="card">
          <h3 style={{ marginBottom: '15px' }}>Status</h3>
          <p><strong>Status:</strong> <StatusBadge status={submission.status} /></p>
          <p><strong>Outcome:</strong> {submission.outcome ? <StatusBadge status={submission.outcome} type="outcome" /> : '—'}</p>
          {submission.outcome_reason && (
            <p><strong>Reason:</strong> {submission.outcome_reason}</p>
          )}
          <p><strong>Date Received:</strong> {formatDate(submission.date_received)}</p>
          {submission.status_updated_at && (
            <p><strong>Last Updated:</strong> {formatDate(submission.status_updated_at)}</p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '15px' }}>Policy Details</h3>
          <p><strong>Premium:</strong> {formatCurrency(submission.premium)}</p>
          <p><strong>Policy Limit:</strong> {formatCurrency(submission.policy_limit)}</p>
          <p><strong>Retention:</strong> {formatCurrency(submission.retention)}</p>
          {submission.effective_date && (
            <p><strong>Effective Date:</strong> {formatDate(submission.effective_date)}</p>
          )}
          {submission.expiration_date && (
            <p><strong>Expiration Date:</strong> {formatDate(submission.expiration_date)}</p>
          )}
        </div>
      </div>

      {submission.business_summary && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '15px' }}>Business Summary</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{submission.business_summary}</p>
        </div>
      )}

      {submission.status_history && submission.status_history.length > 0 && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '15px' }}>Status History</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {submission.status_history.map((history, index) => (
              <div key={index} style={{ padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
                <p><strong>{formatDate(history.changed_at)}</strong> - {history.changed_by}</p>
                <p>
                  {history.old_status} → {history.new_status}
                  {history.old_outcome && history.new_outcome && (
                    <> ({history.old_outcome} → {history.new_outcome})</>
                  )}
                </p>
                {history.notes && <p style={{ fontSize: '14px', color: '#666' }}>{history.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: '15px' }}>Documents</h3>
        <DocumentUpload submissionId={id} onUpload={loadDocuments} />
        
        {documents.length === 0 ? (
          <p style={{ marginTop: '15px', color: '#666' }}>No documents uploaded yet.</p>
        ) : (
          <table style={{ marginTop: '15px' }}>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Type</th>
                <th>Pages</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.filename}</td>
                  <td>{doc.document_type || '—'}</td>
                  <td>{doc.page_count || '—'}</td>
                  <td>{formatDate(doc.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default SubmissionDetail



