import { formatCurrency, formatCompact, calculateAttachment } from '../../../utils/quoteUtils';
import TowerEditor from '../../quote/TowerEditor';

/**
 * TowerCard - Tower Position & Structure Preview
 *
 * Shows tower position visualization and structure table.
 * Only displayed in Quote mode (not submission mode).
 */
export default function TowerCard({
  structure,
  tower,
  ourLimit,
  attachment,
  retention,
  premium,
  expandedCard,
  setExpandedCard,
  showOnlyOurLayer,
  setShowOnlyOurLayer,
  towerCardRef,
  onUpdateOption,
  structureId,
}) {
  // Determine if excess by checking structure.position OR if any layer has attachment > 0
  const structureIsExcess = structure?.position === 'excess';
  const hasStoredAttachments = tower.some(l => (l.attachment || 0) > 0);
  const showAsExcess = structureIsExcess || hasStoredAttachments;

  // Calculate attachments for each layer (tower is ordered bottom-to-top: index 0 = ground layer)
  const towerWithAttachments = tower.map((layer, idx) => ({
    ...layer,
    calculatedAttachment: layer.attachment ?? calculateAttachment(tower, idx)
  }));

  // Sort by attachment descending (highest layer first) for display
  const sortedTower = [...towerWithAttachments].sort((a, b) => b.calculatedAttachment - a.calculatedAttachment);

  // Find our layer (CMAI)
  const cmaiIdx = sortedTower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  const cmaiLayer = cmaiIdx >= 0 ? sortedTower[cmaiIdx] : null;
  const cmaiAttachment = cmaiLayer?.calculatedAttachment || attachment;

  // For visual: layers above and below ours in the sorted (top-to-bottom) display
  const layersAbove = cmaiIdx > 0 ? sortedTower.slice(0, cmaiIdx) : [];
  const layersBelow = cmaiIdx >= 0 ? sortedTower.slice(cmaiIdx + 1) : [];

  const isEditingTower = expandedCard === 'tower';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Tower Position Card - hidden when editing */}
      {!isEditingTower && (
        <div className="lg:col-span-3 border border-gray-200 rounded-lg bg-white p-4">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Tower Position
          </h3>
          <div className="relative">
            {/* Dashed vertical line on left */}
            <div className="absolute left-0 top-0 bottom-0 w-4 flex flex-col items-center">
              <div className="flex-1 border-l-2 border-dashed border-gray-300" />
            </div>
            <div className="pl-6 space-y-1">
              {/* Show layers above ours */}
              {!showOnlyOurLayer && showAsExcess && layersAbove.map((layer, idx) => {
                const layerAttachment = layer.calculatedAttachment || layer.attachment || 0;
                return (
                  <div key={idx} className="bg-gray-100 border border-gray-200 rounded py-2 px-3 text-center">
                    <div className="text-sm font-semibold text-gray-700 flex items-center justify-center gap-1">
                      <span>{formatCompact(layer.limit)}</span>
                      {layerAttachment > 0 && (
                        <span className="text-xs opacity-75">xs {formatCompact(layerAttachment)}</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Our Layer */}
              <div className="bg-purple-600 text-white rounded py-2.5 px-4 text-center shadow-md">
                <div className="text-sm font-bold flex items-center justify-center gap-1">
                  <span>{formatCompact(ourLimit)}</span>
                  {showAsExcess && cmaiAttachment > 0 && (
                    <span className="text-xs opacity-80">xs {formatCompact(cmaiAttachment)}</span>
                  )}
                </div>
              </div>

              {/* Show underlying layers for excess */}
              {!showOnlyOurLayer && showAsExcess && layersBelow.map((layer, idx) => {
                const layerAttachment = layer.calculatedAttachment || layer.attachment || 0;
                return (
                  <div key={idx} className="bg-gray-100 border border-gray-200 rounded py-2 px-3 text-center">
                    <div className="text-sm font-semibold text-gray-700 flex items-center justify-center gap-1">
                      <span>{formatCompact(layer.limit)}</span>
                      {layerAttachment > 0 ? (
                        <span className="text-xs opacity-75">xs {formatCompact(layerAttachment)}</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-gray-600">Primary</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Retention bar - always shown unless collapsed */}
              {!showOnlyOurLayer && retention > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded py-1 px-3 text-center">
                  <div className="text-[10px] text-gray-500 uppercase">Retention {formatCompact(retention)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tower Structure Table - expands to full width when editing */}
      <div
        ref={towerCardRef}
        onClick={() => !isEditingTower && setExpandedCard('tower')}
        className={`border rounded-lg bg-white overflow-hidden transition-all ${
        isEditingTower
          ? 'lg:col-span-12 ring-1 ring-purple-100 border-purple-300'
          : 'lg:col-span-9 border-gray-200 hover:border-gray-300 cursor-pointer'
      }`}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tower Structure</h3>
            {!isEditingTower && sortedTower.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowOnlyOurLayer(!showOnlyOurLayer); }}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  showOnlyOurLayer
                    ? 'bg-purple-100 border-purple-300 text-purple-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {showOnlyOurLayer ? 'Show All' : 'Ours Only'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="text-gray-500">Our Premium: </span>
              <span className="text-green-600 font-semibold">{formatCurrency(premium)}</span>
            </div>
            {isEditingTower ? (
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedCard(null); }}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
              >
                Done
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedCard('tower'); }}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {isEditingTower ? (
          /* Full TowerEditor when editing */
          <div className="p-4">
            <TowerEditor
              quote={structure}
              onSave={(data) => {
                onUpdateOption?.(structureId, data);
                setExpandedCard(null);
              }}
              isPending={false}
              embedded={true}
            />
          </div>
        ) : (
          /* Preview table */
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Carrier</th>
                <th className="px-4 py-2 text-center font-semibold">Limit</th>
                <th className="px-4 py-2 text-center font-semibold">{showAsExcess ? 'Attach' : 'Retention'}</th>
                <th className="px-4 py-2 text-right font-semibold">Premium</th>
                <th className="px-4 py-2 text-right font-semibold">RPM</th>
                <th className="px-4 py-2 text-right font-semibold">ILF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedTower
                .filter(layer => !showOnlyOurLayer || layer.carrier?.toUpperCase().includes('CMAI'))
                .map((layer, idx) => {
                const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
                // For CMAI, fall back to structure.sold_premium for bound quotes
                const layerPremium = isCMAI ? (layer.premium || structure?.sold_premium || 0) : (layer.premium || 0);
                const layerRpm = layer.limit ? Math.round(layerPremium / (layer.limit / 1_000_000)) : null;
                // For ILF, use CMAI premium as base
                const basePremium = cmaiLayer?.premium || tower[0]?.premium || 1;
                const ilf = basePremium > 0 ? Math.round((layerPremium / basePremium) * 100) : null;

                return (
                  <tr key={idx} className={isCMAI ? 'bg-purple-50' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={isCMAI ? 'text-purple-700 font-medium' : 'text-gray-700'}>
                          {layer.carrier || 'TBD'}
                        </span>
                        {isCMAI && (
                          <span className="text-[10px] bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                            Ours
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{formatCompact(layer.limit)}</td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {/* Primary layer (attachment=0) shows retention, others show attachment */}
                      {layer.calculatedAttachment === 0
                        ? formatCompact(layer.retention || retention)
                        : `xs ${formatCompact(layer.calculatedAttachment)}`}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">
                      {layerPremium ? formatCurrency(layerPremium) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {layerRpm ? `$${layerRpm.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {isCMAI ? '100%' : (ilf !== null ? `${ilf}%` : '—')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
