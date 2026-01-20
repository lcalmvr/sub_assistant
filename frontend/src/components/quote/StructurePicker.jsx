import { formatCurrency } from '../../utils/quoteUtils';

/**
 * StructurePicker - Integrated Tower Visual + Option Selector
 *
 * Collapsible picker for selecting quote structures.
 * Shows structure name, premium, and position (excess/primary).
 */
export default function StructurePicker({
  structures,
  activeStructureId,
  onSelect,
  onCreate,
  onClone,
  onDelete,
  isCreating,
  isCloning,
  isDeleting,
  isExpanded,
  onToggle
}) {
  const activeStructure = structures.find(s => s.id === activeStructureId);

  // Collapsed state - just show current structure name and toggle
  if (!isExpanded) {
    return (
      <button
        onClick={onToggle}
        className="bg-white border border-gray-200 rounded-lg p-3 w-full text-left hover:border-purple-300 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 group-hover:text-purple-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Structure</div>
            <div className="font-semibold text-gray-800 truncate">{activeStructure?.quote_name || 'Select'}</div>
          </div>
          <span className="text-xs text-gray-400">{structures.length}</span>
        </div>
      </button>
    );
  }

  // Expanded state - full list
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-800">Structures</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onCreate}
            disabled={isCreating}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
          >
            + New
          </button>
          <button
            onClick={onToggle}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Structure List */}
      <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
        {structures.map(structure => {
          const isActive = activeStructureId === structure.id;
          const tower = structure.tower_json || [];
          const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
          const premium = structure?.sold_premium || cmaiLayer?.premium || 0;

          return (
            <button
              key={structure.id}
              onClick={() => { onSelect(structure.id); onToggle(); }}
              className={`w-full text-left rounded-lg p-3 transition-all ${
                isActive
                  ? 'bg-purple-50 ring-2 ring-purple-400'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`font-semibold truncate ${isActive ? 'text-purple-900' : 'text-gray-800'}`}>
                  {structure.quote_name || 'Untitled'}
                </span>
                {structure.position === 'excess' && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium flex-shrink-0">XS</span>
                )}
              </div>
              {premium > 0 && (
                <div className="text-xs">
                  <span className={isActive ? 'text-purple-600 font-medium' : 'text-gray-600'}>
                    {formatCurrency(premium)}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-end p-3 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <button
            onClick={onClone}
            disabled={isCloning}
            className="text-xs text-gray-600 hover:text-purple-600 disabled:opacity-50 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Clone
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting || structures.length <= 1}
            className="text-xs text-gray-600 hover:text-red-600 disabled:opacity-50 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
