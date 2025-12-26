import React, { useState } from 'react'
import apiClient from '../api/client'

const DocumentUpload = ({ submissionId, onUpload }) => {
  const [file, setFile] = useState(null)
  const [documentType, setDocumentType] = useState('Other')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleFileChange = (e) => {
    setFile(e.target.files[0])
    setMessage('')
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!file) {
      setError('Please select a file')
      return
    }

    setUploading(true)
    setError('')
    setMessage('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('document_type', documentType)

      const response = await apiClient.post(
        `/api/broker/submissions/${submissionId}/documents`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )

      setMessage(response.data.message || 'Document uploaded successfully')
      setFile(null)
      e.target.reset()
      
      if (onUpload) {
        onUpload()
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to upload document')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: '15px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
          <label>File</label>
          <input
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx"
            required
          />
        </div>

        <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
          <label>Document Type</label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
          >
            <option value="Submission Email">Submission Email</option>
            <option value="Application Form">Application Form</option>
            <option value="Questionnaire/Form">Questionnaire/Form</option>
            <option value="Loss Run">Loss Run</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={uploading || !file}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
    </form>
  )
}

export default DocumentUpload

