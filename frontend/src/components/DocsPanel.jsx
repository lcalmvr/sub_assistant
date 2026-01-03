import { useState } from 'react';
import DocumentExtractionViewer from './DocumentExtractionViewer';

export default function DocsPanel({ submissionId, isOpen, onClose }) {
  const [viewMode, setViewMode] = useState('split');

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Full-width Panel */}
      <div className="fixed inset-4 bg-white shadow-2xl z-50 flex flex-col rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Documents & Extractions</h2>
            {/* View Mode Toggle */}
            <div className="flex bg-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === 'split' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Split
              </button>
              <button
                onClick={() => setViewMode('documents')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === 'documents' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Docs
              </button>
              <button
                onClick={() => setViewMode('extractions')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === 'extractions' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Extract
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Shared document/extraction viewer */}
        <DocumentExtractionViewer
          submissionId={submissionId}
          height="100%"
          showHeader={false}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          className="flex-1 min-h-0"
        />
      </div>
    </>
  );
}
