import { useState } from 'react';

// Confidence badge component
function ConfidenceBadge({ confidence, size = 'sm' }) {
  if (confidence === null || confidence === undefined) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const percent = Math.round(confidence * 100);

  let colorClass, label;
  if (percent >= 80) {
    colorClass = 'bg-green-100 text-green-700';
    label = 'High';
  } else if (percent >= 50) {
    colorClass = 'bg-yellow-100 text-yellow-700';
    label = 'Medium';
  } else {
    colorClass = 'bg-red-100 text-red-700';
    label = 'Low';
  }

  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <span className={`${sizeClass} rounded font-medium ${colorClass}`} title={`${percent}% confidence`}>
      {percent}%
    </span>
  );
}

// Conflict badge component
function ConflictBadge({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium hover:bg-orange-200"
      title="Different values in different documents - click to resolve"
    >
      Conflict
    </button>
  );
}

// Field row component
function FieldRow({ fieldName, extraction, onShowSource, onEdit, onAcceptValue }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showConflict, setShowConflict] = useState(false);

  const displayName = fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();

  const formatValue = (value) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ') || '—';
    if (typeof value === 'number') {
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
      return value.toString();
    }
    return String(value);
  };

  const handleStartEdit = () => {
    setEditValue(formatValue(extraction.value));
    setIsEditing(true);
  };

  const handleSave = () => {
    onEdit?.(fieldName, editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleAccept = async (extractionId) => {
    if (onAcceptValue) {
      await onAcceptValue(extractionId);
      setShowConflict(false);
    }
  };

  if (!extraction.is_present) {
    return null; // Don't show fields that weren't in the document
  }

  const hasConflict = extraction.has_conflict && extraction.all_values?.length > 1;

  return (
    <div className={`py-2 border-b border-gray-100 ${hasConflict ? 'bg-orange-50' : 'hover:bg-gray-50'} group`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">{displayName}</span>
            <ConfidenceBadge confidence={extraction.confidence} />
            {hasConflict && (
              <ConflictBadge onClick={() => setShowConflict(!showConflict)} />
            )}
          </div>

          {isEditing ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 text-sm border rounded px-2 py-1"
                autoFocus
              />
              <button
                onClick={handleSave}
                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-sm ${extraction.value !== null ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                {formatValue(extraction.value)}
              </span>
              {extraction.document_name && (
                <span className="text-xs text-gray-400">
                  ({extraction.document_name.slice(0, 20)}...)
                </span>
              )}
            </div>
          )}

          {extraction.source_text && !showConflict && (
            <p className="text-xs text-gray-500 mt-1 truncate" title={extraction.source_text}>
              "{extraction.source_text}"
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 ml-2">
          {extraction.page && (
            <button
              onClick={() => onShowSource?.(extraction.page, extraction.document_id, extraction.value, extraction.source_text)}
              className="text-xs px-2 py-1 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded"
              title={`View source on page ${extraction.page}`}
            >
              p.{extraction.page}
            </button>
          )}
          {onEdit && !isEditing && (
            <button
              onClick={handleStartEdit}
              className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Conflict resolution panel */}
      {showConflict && hasConflict && (
        <div className="mt-2 ml-4 p-2 bg-white border border-orange-200 rounded">
          <p className="text-xs font-medium text-orange-700 mb-2">
            Different values found in different applications:
          </p>
          <div className="space-y-2">
            {extraction.all_values.map((val, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                <div className="flex-1">
                  <span className="font-medium">{formatValue(val.value)}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    from {val.document_name || 'Unknown document'}
                  </span>
                  {val.is_accepted && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                      Accepted
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {val.page && (
                    <button
                      onClick={() => onShowSource?.(val.page, val.document_id, val.value, val.source_text)}
                      className="text-xs px-2 py-1 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded"
                    >
                      View
                    </button>
                  )}
                  {!val.is_accepted && (
                    <button
                      onClick={() => handleAccept(val.id)}
                      className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      Accept
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Section component
function ExtractionSection({ sectionName, fields, onShowSource, onEdit, onAcceptValue, defaultExpanded = true }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const displayName = sectionName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();

  // Count present fields
  const presentFields = Object.values(fields).filter(f => f.is_present);
  const highConfidenceCount = presentFields.filter(f => f.confidence >= 0.8).length;
  const lowConfidenceCount = presentFields.filter(f => f.confidence < 0.5).length;

  if (presentFields.length === 0) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-gray-900">{displayName}</span>
          <span className="text-xs text-gray-500">
            {presentFields.length} field{presentFields.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {highConfidenceCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
              {highConfidenceCount} high
            </span>
          )}
          {lowConfidenceCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
              {lowConfidenceCount} low
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 py-2">
          {Object.entries(fields).map(([fieldName, extraction]) => (
            <FieldRow
              key={fieldName}
              fieldName={fieldName}
              extraction={extraction}
              onShowSource={onShowSource}
              onEdit={onEdit}
              onAcceptValue={onAcceptValue}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Main extraction panel
export default function ExtractionPanel({
  extractions,
  isLoading = false,
  onShowSource,
  onEdit,
  onAcceptValue,
  className = ''
}) {
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!extractions || Object.keys(extractions).length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-center p-8 ${className}`}>
        <div className="text-gray-400 mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-gray-500">No extraction data available</p>
        <p className="text-sm text-gray-400 mt-1">Extract data from a document to see results here</p>
      </div>
    );
  }

  // Calculate overall stats
  const allFields = Object.values(extractions).flatMap(section => Object.values(section));
  const presentFields = allFields.filter(f => f.is_present);
  const avgConfidence = presentFields.length > 0
    ? presentFields.reduce((sum, f) => sum + (f.confidence || 0), 0) / presentFields.length
    : 0;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Stats header */}
      <div className="px-4 py-3 bg-gray-50 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Extracted Data</h3>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">
              {presentFields.length} fields
            </span>
            <span className="flex items-center gap-1">
              <span className="text-gray-500">Avg:</span>
              <ConfidenceBadge confidence={avgConfidence} />
            </span>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {Object.entries(extractions).map(([sectionName, fields]) => (
          <ExtractionSection
            key={sectionName}
            sectionName={sectionName}
            fields={fields}
            onShowSource={onShowSource}
            onEdit={onEdit}
            onAcceptValue={onAcceptValue}
          />
        ))}
      </div>
    </div>
  );
}
