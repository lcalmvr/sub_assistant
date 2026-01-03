import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSubmissionDocuments, getDocumentUrl } from '../api/client';
import DocumentViewer from './review/DocumentViewer';

// Document type icons/colors
const DOC_TYPE_CONFIG = {
  'Application Form': { color: 'bg-blue-100 text-blue-700', icon: 'A' },
  'Loss Run': { color: 'bg-orange-100 text-orange-700', icon: 'L' },
  'Quote': { color: 'bg-green-100 text-green-700', icon: 'Q' },
  'Policy': { color: 'bg-purple-100 text-purple-700', icon: 'P' },
  'Financial Statement': { color: 'bg-yellow-100 text-yellow-700', icon: 'F' },
  'Submission Email': { color: 'bg-gray-100 text-gray-700', icon: 'E' },
  'default': { color: 'bg-gray-100 text-gray-600', icon: 'D' },
};

function getDocConfig(docType) {
  return DOC_TYPE_CONFIG[docType] || DOC_TYPE_CONFIG['default'];
}

export default function DocsPanel({ submissionId, isOpen, onClose }) {
  const [selectedDocId, setSelectedDocId] = useState(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['submission-documents', submissionId],
    queryFn: () => getSubmissionDocuments(submissionId).then(res => res.data),
    enabled: isOpen && !!submissionId,
  });

  // Auto-select first document
  const docs = documents?.documents || [];
  const selectedDoc = docs.find(d => d.id === selectedDocId) || docs[0];
  const documentUrl = selectedDoc ? getDocumentUrl(selectedDoc.id) : null;

  // Check if document is viewable (PDF or image)
  const isViewable = (doc) => {
    const filename = doc?.filename?.toLowerCase() || '';
    return filename.endsWith('.pdf') || filename.endsWith('.png') ||
           filename.endsWith('.jpg') || filename.endsWith('.jpeg');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[900px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
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
          {/* Document List */}
          <div className="w-64 border-r bg-gray-50 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-gray-500 text-sm">Loading documents...</div>
            ) : docs.length === 0 ? (
              <div className="p-4 text-gray-500 text-sm">No documents uploaded</div>
            ) : (
              <div className="p-2 space-y-1">
                {docs.map((doc) => {
                  const config = getDocConfig(doc.document_type);
                  const isSelected = doc.id === (selectedDoc?.id);
                  const viewable = isViewable(doc);

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
                        <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${config.color}`}>
                          {config.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate" title={doc.filename}>
                            {doc.filename}
                          </p>
                          <p className="text-xs text-gray-500">{doc.document_type || 'Unknown'}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Document Viewer */}
          <div className="flex-1 flex flex-col bg-gray-100">
            {selectedDoc && isViewable(selectedDoc) ? (
              <DocumentViewer
                documentUrl={documentUrl}
                className="flex-1"
              />
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
        </div>
      </div>
    </>
  );
}
