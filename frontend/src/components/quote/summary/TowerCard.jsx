import { useRef, useState } from 'react';
import { formatCurrency, formatCompact, calculateAttachment } from '../../../utils/quoteUtils';
import { getAnnualPremium, getActualPremium, isMultidateTower, getLayerEffectiveFromConfig } from '../../../utils/premiumUtils';
import TowerEditor from '../../quote/TowerEditor';
import TowerPricingChart from '../../quote/TowerPricingChart';

// Color palette for date groups (index maps to unique date)
const DATE_COLORS = [
  { bg: 'bg-gray-300', label: 'gray-300' },      // Default/policy date
  { bg: 'bg-teal-400', label: 'teal-400' },      // TBD
  { bg: 'bg-violet-400', label: 'violet-400' },  // Custom date 1
  { bg: 'bg-blue-400', label: 'blue-400' },      // Custom date 2
  { bg: 'bg-emerald-400', label: 'emerald-400' },// Custom date 3
];

/**
 * Get color for a date value. TBD always gets teal, policy default gets gray,
 * other dates get assigned colors in order of appearance.
 */
function getDateColor(effective, policyEffective, colorMap) {
  if (effective === 'TBD') return DATE_COLORS[1]; // teal
  if (effective === policyEffective) return DATE_COLORS[0]; // gray (default)

  // For other dates, use the colorMap to get consistent colors
  const colorIndex = colorMap.get(effective);
  if (colorIndex !== undefined) {
    return DATE_COLORS[colorIndex] || DATE_COLORS[2];
  }
  return DATE_COLORS[2]; // fallback to violet
}

/**
 * Format date for display in key
 */
function formatKeyDate(dateStr) {
  if (!dateStr || dateStr === 'TBD') return 'TBD';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * TowerPositionCard - Visual tower position with optional date color rail
 */
function TowerPositionCard({
  sortedTower,
  showOnlyOurLayer,
  showAsExcess,
  layersAbove,
  layersBelow,
  cmaiLayer,
  cmaiAttachment,
  ourLimit,
  retention,
  dateConfig,
  policyEffective,
}) {
  const hasMultipleDates = isMultidateTower(dateConfig);

  // Build color map for consistent date colors
  const colorMap = new Map();
  let nextColorIndex = 2; // Start after gray(0) and teal(1)

  // Group layers by effective date for the rail
  const dateGroups = [];
  if (hasMultipleDates && !showOnlyOurLayer) {
    let currentGroup = null;

    // Process layers top-to-bottom (sortedTower is already sorted by attachment desc)
    sortedTower.forEach((layer) => {
      const attachment = layer.calculatedAttachment || 0;
      const effective = getLayerEffectiveFromConfig(attachment, dateConfig, policyEffective);

      // Assign color index for non-TBD, non-default dates
      if (effective !== 'TBD' && effective !== policyEffective && !colorMap.has(effective)) {
        colorMap.set(effective, nextColorIndex);
        nextColorIndex = Math.min(nextColorIndex + 1, DATE_COLORS.length - 1);
      }

      if (!currentGroup || currentGroup.effective !== effective) {
        if (currentGroup) dateGroups.push(currentGroup);
        currentGroup = { effective, count: 1 };
      } else {
        currentGroup.count++;
      }
    });
    if (currentGroup) dateGroups.push(currentGroup);
  }

  // Collect unique dates for the key (in display order)
  const uniqueDates = hasMultipleDates && !showOnlyOurLayer
    ? [...new Set(dateGroups.map(g => g.effective))]
    : [];

  return (
    <div className="lg:col-span-3 border border-gray-200 rounded-lg bg-white p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        Tower Position
      </h3>

      {hasMultipleDates && !showOnlyOurLayer ? (
        /* Multi-date layout with continuous color rail */
        <>
          <div className="space-y-1">
            {/* Render each layer with inline rail segment */}
            {sortedTower.map((layer, idx) => {
              const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
              const layerAttachment = layer.calculatedAttachment || layer.attachment || 0;
              const effective = getLayerEffectiveFromConfig(layerAttachment, dateConfig, policyEffective);
              const color = getDateColor(effective, policyEffective, colorMap);

              // Check if previous/next layers have same date for continuous rail styling
              const prevLayer = idx > 0 ? sortedTower[idx - 1] : null;
              const nextLayer = idx < sortedTower.length - 1 ? sortedTower[idx + 1] : null;
              const prevEffective = prevLayer ? getLayerEffectiveFromConfig(prevLayer.calculatedAttachment || 0, dateConfig, policyEffective) : null;
              const nextEffective = nextLayer ? getLayerEffectiveFromConfig(nextLayer.calculatedAttachment || 0, dateConfig, policyEffective) : null;

              const isFirstInGroup = prevEffective !== effective;
              const isLastInGroup = nextEffective !== effective;

              // Rail segment rounding - only round the ends of each date group
              const railRounding = isFirstInGroup && isLastInGroup
                ? 'rounded-full'
                : isFirstInGroup
                ? 'rounded-t-full'
                : isLastInGroup
                ? 'rounded-b-full'
                : '';

              const layerPremium = getAnnualPremium(layer);

              return (
                <div key={idx} className="flex gap-2 items-stretch">
                  {/* Rail segment - extends into gap below when not last in group */}
                  <div
                    className={`w-1.5 shrink-0 ${color.bg} ${railRounding} relative`}
                    style={{
                      marginBottom: isLastInGroup ? 0 : '-4px',
                      zIndex: isLastInGroup ? 0 : 1,
                    }}
                  />
                  {/* Layer card */}
                  {isCMAI ? (
                    <div className="flex-1 bg-purple-600 text-white rounded py-1.5 px-3 shadow-md flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-medium opacity-90 truncate">{layer.carrier || 'CMAI'}</div>
                        <div className="text-sm font-bold flex items-center gap-1">
                          <span>{formatCompact(layer.limit)}</span>
                          {showAsExcess && layerAttachment > 0 && (
                            <span className="text-xs opacity-80">xs {formatCompact(layerAttachment)}</span>
                          )}
                        </div>
                      </div>
                      {layerPremium > 0 && (
                        <span className="text-sm font-semibold">{formatCurrency(layerPremium)}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 bg-gray-100 border border-gray-200 rounded py-1.5 px-3 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] text-gray-500 truncate">{layer.carrier || 'TBD'}</div>
                        <div className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                          <span>{formatCompact(layer.limit)}</span>
                          {layerAttachment > 0 ? (
                            <span className="text-xs opacity-75">xs {formatCompact(layerAttachment)}</span>
                          ) : (
                            <span className="text-[11px] font-semibold text-gray-600">Primary</span>
                          )}
                        </div>
                      </div>
                      {layerPremium > 0 && (
                        <span className="text-sm font-semibold text-green-600">{formatCurrency(layerPremium)}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Retention */}
            {retention > 0 && (
              <div className="flex gap-2">
                <div className="w-1.5 shrink-0" /> {/* Empty space to align with rail */}
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded py-1 px-3 text-center">
                  <div className="text-[10px] text-gray-500 uppercase">Retention {formatCompact(retention)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Date key/legend */}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
              {uniqueDates.map((date) => {
                const color = getDateColor(date, policyEffective, colorMap);
                return (
                  <div key={date} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 ${color.bg} rounded-full shrink-0`} />
                    <span className="text-gray-600 truncate">{formatKeyDate(date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* Standard layout with dashed line */
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-4 flex flex-col items-center">
            <div className="flex-1 border-l-2 border-dashed border-gray-300" />
          </div>
          <div className="pl-6 space-y-1">
            {/* Layers above ours */}
            {!showOnlyOurLayer && showAsExcess && layersAbove.map((layer, idx) => {
              const layerAttachment = layer.calculatedAttachment || layer.attachment || 0;
              const layerPremium = getAnnualPremium(layer);
              return (
                <div key={idx} className="bg-gray-100 border border-gray-200 rounded py-1.5 px-3 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-gray-500 truncate">{layer.carrier || 'TBD'}</div>
                    <div className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                      <span>{formatCompact(layer.limit)}</span>
                      {layerAttachment > 0 && (
                        <span className="text-xs opacity-75">xs {formatCompact(layerAttachment)}</span>
                      )}
                    </div>
                  </div>
                  {layerPremium > 0 && (
                    <span className="text-sm font-semibold text-green-600">{formatCurrency(layerPremium)}</span>
                  )}
                </div>
              );
            })}

            {/* Our Layer */}
            {(() => {
              const cmaiPremium = cmaiLayer ? getAnnualPremium(cmaiLayer) : 0;
              return (
                <div className="bg-purple-600 text-white rounded py-1.5 px-3 shadow-md flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-medium opacity-90 truncate">{cmaiLayer?.carrier || 'CMAI'}</div>
                    <div className="text-sm font-bold flex items-center gap-1">
                      <span>{formatCompact(ourLimit)}</span>
                      {showAsExcess && cmaiAttachment > 0 && (
                        <span className="text-xs opacity-80">xs {formatCompact(cmaiAttachment)}</span>
                      )}
                    </div>
                  </div>
                  {cmaiPremium > 0 && (
                    <span className="text-sm font-semibold">{formatCurrency(cmaiPremium)}</span>
                  )}
                </div>
              );
            })()}

            {/* Layers below ours */}
            {!showOnlyOurLayer && showAsExcess && layersBelow.map((layer, idx) => {
              const layerAttachment = layer.calculatedAttachment || layer.attachment || 0;
              const layerPremium = getAnnualPremium(layer);
              return (
                <div key={idx} className="bg-gray-100 border border-gray-200 rounded py-1.5 px-3 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-gray-500 truncate">{layer.carrier || 'TBD'}</div>
                    <div className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                      <span>{formatCompact(layer.limit)}</span>
                      {layerAttachment > 0 ? (
                        <span className="text-xs opacity-75">xs {formatCompact(layerAttachment)}</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-gray-600">Primary</span>
                      )}
                    </div>
                  </div>
                  {layerPremium > 0 && (
                    <span className="text-sm font-semibold text-green-600">{formatCurrency(layerPremium)}</span>
                  )}
                </div>
              );
            })}

            {/* Retention */}
            {!showOnlyOurLayer && retention > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded py-1 px-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase">Retention {formatCompact(retention)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * TowerCard - Tower Position & Structure Preview
 *
 * Shows tower position visualization and structure table.
 * Only displayed in Quote mode (not submission mode).
 */
export default function TowerCard({
  structure,
  variation,
  submission,
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
  const towerSaveRef = useRef(null);
  const [showPricingChart, setShowPricingChart] = useState(false);

  // Merge structure with term dates from variation/submission cascade
  const quoteWithDates = {
    ...structure,
    effective_date: variation?.effective_date_override || structure?.effective_date || submission?.effective_date,
    expiration_date: variation?.expiration_date_override || structure?.expiration_date || submission?.expiration_date,
    date_config: variation?.date_config || structure?.date_config,
  };
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
        <TowerPositionCard
          sortedTower={sortedTower}
          showOnlyOurLayer={showOnlyOurLayer}
          showAsExcess={showAsExcess}
          layersAbove={layersAbove}
          layersBelow={layersBelow}
          cmaiLayer={cmaiLayer}
          cmaiAttachment={cmaiAttachment}
          ourLimit={ourLimit}
          retention={retention}
          dateConfig={quoteWithDates.date_config}
          policyEffective={quoteWithDates.effective_date}
        />
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
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between" data-tower-editor-ignore>
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tower Structure</h3>
            {!isEditingTower && sortedTower.length > 1 && (
              <>
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
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPricingChart(true); }}
                  className="text-[10px] px-2 py-0.5 rounded border bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors flex items-center gap-1"
                  title="View pricing chart"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Chart
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              {(() => {
                const annualPremium = cmaiLayer ? getAnnualPremium(cmaiLayer) : premium;
                const chargedPremium = cmaiLayer ? getActualPremium(cmaiLayer) : premium;
                const showBoth = annualPremium && chargedPremium && Math.abs(annualPremium - chargedPremium) > 0.01;
                return showBoth ? (
                  <>
                    <span className="text-gray-500">Term: </span>
                    <span className="text-green-600 font-semibold">{formatCurrency(chargedPremium)}</span>
                    <span className="text-gray-400 mx-1">|</span>
                    <span className="text-gray-500">Annual: </span>
                    <span className="text-gray-600 font-medium">{formatCurrency(annualPremium)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-gray-500">Our Premium: </span>
                    <span className="text-green-600 font-semibold">{formatCurrency(annualPremium || premium)}</span>
                  </>
                );
              })()}
            </div>
            {isEditingTower ? (
              <button
                data-tower-editor-ignore
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[TowerCard] Done clicked, towerSaveRef.current=', towerSaveRef.current);
                  if (towerSaveRef.current) {
                    towerSaveRef.current();
                  } else {
                    setExpandedCard(null);
                  }
                }}
                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
              >
                Done
              </button>
            ) : (
              <button
                data-tower-editor-ignore
                onMouseDown={(e) => e.stopPropagation()}
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
              quote={quoteWithDates}
              onSave={(data) => {
                onUpdateOption?.(structureId, data);
                setExpandedCard(null);
              }}
              isPending={false}
              embedded={true}
              saveRef={towerSaveRef}
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
                .map((layer, idx, filteredArray) => {
                const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
                // For CMAI, get both annual and term (actual) premiums
                const annualPremium = getAnnualPremium(layer);
                const termPremium = isCMAI ? getActualPremium(layer) : null;
                const layerPremium = isCMAI
                  ? (structure?.sold_premium || annualPremium)
                  : annualPremium;
                const layerRpm = layer.limit ? Math.round(layerPremium / (layer.limit / 1_000_000)) : null;

                // ILF = this layer's RPM / preceding layer's RPM
                // sortedTower is sorted by attachment DESC (highest first), so "preceding" is the next item (lower attachment)
                const fullIndex = sortedTower.findIndex(l => l === layer);
                const precedingLayer = fullIndex < sortedTower.length - 1 ? sortedTower[fullIndex + 1] : null;
                const precedingPremium = precedingLayer ? getAnnualPremium(precedingLayer) : null;
                const precedingRpm = precedingLayer?.limit ? Math.round(precedingPremium / (precedingLayer.limit / 1_000_000)) : null;
                const ilf = precedingRpm && precedingRpm > 0 && layerRpm ? Math.round((layerRpm / precedingRpm) * 100) : null;

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
                      {isCMAI && termPremium && annualPremium && Math.abs(termPremium - annualPremium) > 0.01 ? (
                        <>
                          {formatCurrency(termPremium)}
                          <span className="text-gray-400 text-xs font-normal ml-1">({formatCurrency(annualPremium)} annual)</span>
                        </>
                      ) : (
                        annualPremium ? formatCurrency(annualPremium) : '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {layerRpm ? `$${layerRpm.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {ilf !== null ? `${ilf}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pricing Chart Modal */}
      {showPricingChart && (
        <TowerPricingChart
          tower={towerWithAttachments}
          onClose={() => setShowPricingChart(false)}
        />
      )}
    </div>
  );
}
