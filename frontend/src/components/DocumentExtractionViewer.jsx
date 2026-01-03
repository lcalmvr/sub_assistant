import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubmissionDocuments, getExtractions, getDocumentBbox, uploadSubmissionDocument } from '../api/client';
import PdfHighlighter from './review/PdfHighlighter';
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

function isImageFile(filename) {
  return /\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test(filename);
}

function isPdfFile(filename) {
  return /\.pdf$/i.test(filename);
}

// Document selector component
function DocumentSelector({ documents, selectedId, onSelect }) {
  const docs = documents?.documents || [];

  return (
    <div className="w-56 border-r bg-gray-50 overflow-y-auto flex-shrink-0 h-full">
      {docs.length === 0 ? (
        <div className="p-4 text-gray-500 text-sm">No documents</div>
      ) : (
        <div className="p-2 space-y-1">
          {docs.map((doc) => {
            const config = getDocConfig(doc.type);
            const isSelected = doc.id === selectedId;
            const hasUrl = !!doc.url;

            return (
              <button
                key={doc.id}
                onClick={() => onSelect(doc)}
                disabled={!hasUrl}
                className={`w-full text-left p-2 rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-purple-100 border border-purple-300'
                    : hasUrl
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
                    <p className="text-xs text-gray-500">{doc.type || 'Unknown'}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DocumentExtractionViewer({
  submissionId,
  height = '100%',
  showHeader = true,
  initialViewMode = 'split',
  className = '',
}) {
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [highlightPage, setHighlightPage] = useState(null);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [activeHighlight, setActiveHighlight] = useState(null);

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['submission-documents', submissionId],
    queryFn: () => getSubmissionDocuments(submissionId).then(res => res.data),
    enabled: !!submissionId,
  });

  const { data: extractions, isLoading: extractionsLoading } = useQuery({
    queryKey: ['extractions', submissionId],
    queryFn: () => getExtractions(submissionId).then(res => res.data),
    enabled: !!submissionId,
  });

  // Auto-select first document with URL
  useEffect(() => {
    if (documents?.documents && !selectedDocument) {
      const firstViewable = documents.documents.find(d => d.url);
      if (firstViewable) setSelectedDocument(firstViewable);
    }
  }, [documents, selectedDocument]);

  // Handle clicking "show source" on an extraction
  const handleShowSource = async (pageNumber, documentId, value, sourceText, bbox = null, answer_bbox = null, question_bbox = null) => {
    // Find the document
    const doc = documents?.documents?.find(d => d.id === documentId);
    if (doc) {
      setSelectedDocument(doc);
    }

    // Switch to split or documents view to show the PDF
    if (viewMode === 'extractions') {
      setViewMode('split');
    }

    // Set page and trigger scroll
    setHighlightPage(pageNumber);
    setScrollTrigger(prev => prev + 1);

    // Set highlight if we have bbox data
    if (question_bbox || answer_bbox || bbox) {
      setActiveHighlight({
        page: pageNumber,
        question_bbox,
        answer_bbox,
        bbox,
      });
    } else if (documentId && pageNumber) {
      // Try to fetch bbox data
      try {
        const response = await getDocumentBbox(documentId, pageNumber, sourceText || String(value));
        if (response.data?.bbox) {
          setActiveHighlight({
            page: pageNumber,
            bbox: response.data.bbox,
          });
        } else {
          setActiveHighlight(null);
        }
      } catch (error) {
        console.error('Failed to fetch bbox:', error);
        setActiveHighlight(null);
      }
    } else {
      setActiveHighlight(null);
    }
  };

  const showDocs = viewMode === 'split' || viewMode === 'documents';
  const showExtractions = viewMode === 'split' || viewMode === 'extractions';

  return (
    <div className={`flex flex-col ${className}`} style={{ height }}>
      {/* Header with view mode toggle */}
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Documents & Extractions</h3>
          <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-0.5">
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
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Document list */}
        {showDocs && (
          <DocumentSelector
            documents={documents}
            selectedId={selectedDocument?.id}
            onSelect={setSelectedDocument}
          />
        )}

        {/* Split content area */}
        <div className={`flex-1 flex ${viewMode === 'split' ? 'divide-x' : ''} overflow-hidden`}>
          {/* Document viewer */}
          {showDocs && (
            <div className={`${viewMode === 'split' ? 'w-1/2' : 'flex-1'} flex flex-col bg-gray-200 min-h-0`}>
              {selectedDocument?.url ? (
                <>
                  {/* Document header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-white border-b flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]" title={selectedDocument.filename}>
                        {selectedDocument.filename}
                      </span>
                      {selectedDocument.is_scanned && (
                        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                          Scanned
                        </span>
                      )}
                    </div>
                    <a
                      href={selectedDocument.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                    >
                      Open
                    </a>
                  </div>

                  {/* Document content */}
                  {isImageFile(selectedDocument.filename) ? (
                    <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
                      <img
                        src={selectedDocument.url}
                        alt={selectedDocument.filename}
                        className="max-w-full h-auto shadow-lg bg-white"
                      />
                    </div>
                  ) : isPdfFile(selectedDocument.filename) ? (
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <PdfHighlighter
                        url={selectedDocument.url}
                        initialPage={highlightPage || 1}
                        scrollTrigger={scrollTrigger}
                        highlight={activeHighlight}
                        className="h-full"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-gray-500">Cannot preview this file type</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-gray-500">Select a document to view</p>
                </div>
              )}
            </div>
          )}

          {/* Extractions panel */}
          {showExtractions && (
            <div className={`${viewMode === 'split' ? 'w-1/2' : 'flex-1'} overflow-hidden bg-white`}>
              <ExtractionPanel
                extractions={extractions?.sections}
                isLoading={extractionsLoading}
                onShowSource={handleShowSource}
                className="h-full"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
