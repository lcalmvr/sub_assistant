import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSubmissionDocuments, getDocumentUrl, getExtractions } from '../api/client';
import DocumentViewer from './review/DocumentViewer';
import ExtractionPanel from './review/ExtractionPanel';

// Document type icons/colors
const DOC_TYPE_CONFIG = {
  'Application Form': { color: 'bg-blue-100 text-blue-700', icon: 'A' },
  'Questionnaire/Form': { color: 'bg-blue-100 text-blue-700', icon: 'A' },
  'Supplemental Application': { color: 'bg-blue-100 text-blue-700', icon: 'A' },
  'application': { color: 'bg-blue-100 text-blue-700', icon: 'A' },
  'Loss Run': { color: 'bg-orange-100 text-orange-700', icon: 'L' },
  'loss_runs': { color: 'bg-orange-100 text-orange-700', icon: 'L' },
  'Quote': { color: 'bg-green-100 text-green-700', icon: 'Q' },
  'quote': { color: 'bg-green-100 text-green-700', icon: 'Q' },
  'Policy': { color: 'bg-purple-100 text-purple-700', icon: 'P' },
  'policy': { color: 'bg-purple-100 text-purple-700', icon: 'P' },
  'Financial Statement': { color: 'bg-yellow-100 text-yellow-700', icon: 'F' },
  'financial': { color: 'bg-yellow-100 text-yellow-700', icon: 'F' },
  'Submission Email': { color: 'bg-gray-100 text-gray-700', icon: 'E' },
  'Standardized Data': { color: 'bg-cyan-100 text-cyan-700', icon: 'S' },
  'default': { color: 'bg-gray-100 text-gray-600', icon: 'D' },
};

function getDocConfig(docType) {
  return DOC_TYPE_CONFIG[docType] || DOC_TYPE_CONFIG['default'];
}

// Check file type
function getFileType(filename) {
  const ext = filename?.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  if (['json', 'txt'].includes(ext)) return 'text';
  return 'unknown';
}

export default function DocsPanel({ submissionId, isOpen, onClose }) {
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [viewMode, setViewMode] = useState('split'); // 'split', 'documents', 'extractions'

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['submission-documents', submissionId],
    queryFn: () => getSubmissionDocuments(submissionId).then(res => res.data),
    enabled: isOpen && !!submissionId,
  });

  const { data: extractions, isLoading: extractionsLoading } = useQuery({
    queryKey: ['extractions', submissionId],
    queryFn: () => getExtractions(submissionId).then(res => res.data),
    enabled: isOpen && !!submissionId,
  });

  // Check if document is viewable (PDF or image with a URL)
  const isViewable = (doc) => {
    if (!doc?.url) return false;
    const fileType = getFileType(doc?.filename);
    return fileType === 'pdf' || fileType === 'image';
  };

  // Auto-select first viewable document
  const docs = documents?.documents || [];
  const viewableDocs = docs.filter(isViewable);
  const selectedDoc = docs.find(d => d.id === selectedDocId) || viewableDocs[0] || docs[0];
  const documentUrl = selectedDoc?.url || (selectedDoc ? getDocumentUrl(selectedDoc.id) : null);
  const selectedFileType = selectedDoc ? getFileType(selectedDoc.filename) : null;

  if (!isOpen) return null;

  const showDocs = viewMode === 'split' || viewMode === 'documents';
  const showExtractions = viewMode === 'split' || viewMode === 'extractions';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[1100px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
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

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Document List - always visible when docs are shown */}
          {showDocs && (
            <div className="w-56 border-r bg-gray-50 overflow-y-auto flex-shrink-0">
              {docsLoading ? (
                <div className="p-4 text-gray-500 text-sm">Loading...</div>
              ) : docs.length === 0 ? (
                <div className="p-4 text-gray-500 text-sm">No documents</div>
              ) : (
                <div className="p-2 space-y-1">
                  {docs.map((doc) => {
                    const config = getDocConfig(doc.type);
                    const isSelected = doc.id === (selectedDoc?.id);
                    const viewable = isViewable(doc);
                    const fileType = getFileType(doc.filename);

                    return (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        disabled={!viewable}
                        className={`w-full text-left p-2 rounded-lg transition-colors ${
                          isSelected
                            ? 'bg-purple-100 border border-purple-300'
                            : viewable
                              ? 'hover:bg-gray-100 border border-transparent'
                              : 'opacity-50 cursor-not-allowed border border-transparent'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${config.color}`}>
                            {config.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate" title={doc.filename}>
                              {doc.filename}
                            </p>
                            <p className="text-xs text-gray-500">
                              {doc.type || 'Unknown'}
                              {!viewable && <span className="ml-1 text-gray-400">({fileType})</span>}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Main Content Area */}
          <div className={`flex-1 flex ${viewMode === 'split' ? 'divide-x' : ''} overflow-hidden`}>
            {/* Document Viewer */}
            {showDocs && (
              <div className={`${viewMode === 'split' ? 'w-1/2' : 'flex-1'} flex flex-col bg-gray-200`}>
                {selectedDoc && selectedFileType === 'pdf' ? (
                  <DocumentViewer
                    documentUrl={documentUrl}
                    className="flex-1"
                  />
                ) : selectedDoc && selectedFileType === 'image' ? (
                  <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
                    <img
                      src={documentUrl}
                      alt={selectedDoc.filename}
                      className="max-w-full max-h-full object-contain shadow-lg rounded"
                    />
                  </div>
                ) : selectedDoc ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-gray-500 mb-2">Cannot preview this file type</p>
                      <p className="text-sm text-gray-400">{selectedDoc.filename}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-gray-500">Select a document to view</p>
                  </div>
                )}
              </div>
            )}

            {/* Extractions Panel */}
            {showExtractions && (
              <div className={`${viewMode === 'split' ? 'w-1/2' : 'flex-1'} overflow-auto bg-white`}>
                <ExtractionPanel
                  extractions={extractions?.extractions || []}
                  isLoading={extractionsLoading}
                  className="h-full"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
