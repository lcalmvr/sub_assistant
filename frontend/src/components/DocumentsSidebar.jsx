import { useState } from 'react';

/**
 * Minimal collapsible sidebar for document list
 * Matches the clean aesthetic of the Layout v2 mockup
 */
export default function DocumentsSidebar({
  documents,
  selectedDocId,
  onSelectDoc,
  onUpload,
  isUploading,
  collapsed,
  onToggleCollapse,
}) {
  // Simple document icon based on type
  const getDocIcon = (type) => {
    const icons = {
      'application': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'Application Form': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'loss_run': 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'Loss Runs': 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    };
    return icons[type] || 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z';
  };

  // Collapsed state - minimal icon strip
  if (collapsed) {
    return (
      <div className="w-11 bg-white border-r border-gray-200 flex flex-col">
        {/* Expand chevron */}
        <button
          onClick={onToggleCollapse}
          className="h-10 flex items-center justify-center hover:bg-gray-50 text-gray-400 hover:text-gray-600"
          title="Expand documents"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Document icons */}
        <div className="flex-1 overflow-y-auto">
          {documents?.documents?.map((doc) => (
            <button
              key={doc.id}
              onClick={() => onSelectDoc(doc)}
              className={`w-full h-10 flex items-center justify-center transition-colors ${
                selectedDocId === doc.id
                  ? 'bg-purple-50 text-purple-600 border-r-2 border-purple-500'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              }`}
              title={doc.filename}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={getDocIcon(doc.type)} />
              </svg>
            </button>
          ))}
        </div>

        {/* Add button */}
        <label className="h-10 flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600 cursor-pointer border-t border-gray-100">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload?.(file, null);
            }}
            disabled={isUploading}
          />
        </label>
      </div>
    );
  }

  // Expanded state - clean list
  return (
    <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
      {/* Collapse chevron - minimal header */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-gray-100">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Documents</span>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          title="Collapse"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto py-1">
        {documents?.documents?.map((doc) => (
          <button
            key={doc.id}
            onClick={() => onSelectDoc(doc)}
            className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${
              selectedDocId === doc.id
                ? 'bg-purple-50 text-purple-700 border-r-2 border-purple-500'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 ${selectedDocId === doc.id ? 'text-purple-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={getDocIcon(doc.type)} />
            </svg>
            <span className="text-sm break-words">{doc.filename}</span>
          </button>
        ))}
      </div>

      {/* Add document - subtle */}
      <div className="px-2 py-2 border-t border-gray-100">
        <label className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs cursor-pointer transition-colors ${
          isUploading
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
        }`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
          <span>{isUploading ? 'Uploading...' : 'Add document'}</span>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload?.(file, null);
            }}
            disabled={isUploading}
          />
        </label>
      </div>
    </div>
  );
}
