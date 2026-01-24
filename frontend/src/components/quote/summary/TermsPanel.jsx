import { useState } from 'react';
import { useOptimisticMutation } from '../../../hooks/useOptimisticMutation';
import { updateVariation } from '../../../api/client';
import PolicyTermEditor from '../../PolicyTermEditor';
import DateConfigModal from '../DateConfigModal';
import { isMultidateTower, normalizeDateConfig, getLayerEffectiveFromConfig } from '../../../utils/premiumUtils';
import { calculateAttachment } from '../../../utils/quoteUtils';

/**
 * TermsPanel - Policy term editor for quote mode
 *
 * Handles policy term editing and multidate configuration.
 * When multidate, shows CMAI layer's effective date (read-only).
 * When single date, shows primary layer date (editable).
 * "Manage Split Dates" opens modal for attachment-based date configuration.
 */
export default function TermsPanel({ structure, variation, submission, submissionId, tower = [] }) {
  const [showDateConfigModal, setShowDateConfigModal] = useState(false);

  // Update variation mutation
  const updateMutation = useOptimisticMutation({
    mutationFn: (data) => updateVariation(variation.id, data),
    queryKey: ['structures', submissionId],
    optimisticUpdate: (old, data) =>
      (old || []).map(s => s.id === structure.id ? {
        ...s,
        variations: (s.variations || []).map(v => v.id === variation.id ? { ...v, ...data } : v)
      } : s),
  });

  if (!variation) {
    return <div className="py-8 text-center text-gray-400 text-sm">No variation selected</div>;
  }

  // Get current values (cascade: variation → structure → submission)
  const expirationDate = variation?.expiration_date_override || structure?.expiration_date || submission?.expiration_date || '';

  // Get date_config
  const dateConfig = variation?.date_config || null;

  // Check if this is a multidate tower
  const hasMultipleDates = isMultidateTower(dateConfig);

  // Find CMAI layer and its effective date
  const cmaiIndex = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  const cmaiAttachment = cmaiIndex >= 0 ? calculateAttachment(tower, cmaiIndex) : 0;

  // Get effective date: use CMAI layer's date when multidate, otherwise primary date
  let effectiveDate = '';
  let datesTbd = false;

  if (hasMultipleDates && cmaiIndex >= 0) {
    // Use CMAI layer's effective date from config
    const cmaiEffective = getLayerEffectiveFromConfig(cmaiAttachment, dateConfig, null);
    if (cmaiEffective === 'TBD') {
      datesTbd = true;
      effectiveDate = '';
    } else {
      effectiveDate = cmaiEffective || '';
    }
  } else {
    // Use primary layer date (first in config)
    const primaryEffective = dateConfig?.[0]?.effective;
    if (primaryEffective === 'TBD') {
      datesTbd = true;
      effectiveDate = '';
    } else {
      effectiveDate = primaryEffective || variation?.effective_date_override || structure?.effective_date || submission?.effective_date || '';
      datesTbd = variation?.dates_tbd || false;
    }
  }

  const handleDatesChange = ({ datesTbd: newDatesTbd, effectiveDate: newEffectiveDate, expirationDate: newExpirationDate }) => {
    // When primary date changes, also update date_config[0]
    const newDateConfig = dateConfig
      ? dateConfig.map((rule, i) => i === 0 ? { ...rule, effective: newDatesTbd ? 'TBD' : newEffectiveDate } : rule)
      : [{ effective: newDatesTbd ? 'TBD' : newEffectiveDate, attachment_min: 0 }];

    updateMutation.mutate({
      dates_tbd: newDatesTbd,
      effective_date_override: newEffectiveDate || null,
      expiration_date_override: newExpirationDate || null,
      date_config: newDateConfig,
    });
  };

  const handleTbdToggle = (newTbd) => {
    // When toggling TBD, update date_config[0] as well
    const newDateConfig = dateConfig
      ? dateConfig.map((rule, i) => i === 0 ? { ...rule, effective: newTbd ? 'TBD' : '' } : rule)
      : [{ effective: newTbd ? 'TBD' : '', attachment_min: 0 }];

    updateMutation.mutate({
      dates_tbd: newTbd,
      date_config: newDateConfig,
      ...(newTbd ? { effective_date_override: null, expiration_date_override: null } : {}),
    });
  };

  const handleDateConfigApply = (newDateConfig) => {
    // Normalize and save date_config
    const normalized = normalizeDateConfig(newDateConfig);
    const primaryEffective = normalized[0]?.effective;
    const primaryIsTbd = primaryEffective === 'TBD';

    updateMutation.mutate({
      date_config: normalized,
      // Keep effective_date_override in sync for backward compat
      effective_date_override: primaryIsTbd ? null : primaryEffective,
      dates_tbd: primaryIsTbd,
    });

    setShowDateConfigModal(false);
  };

  return (
    <div className="space-y-4">
      {hasMultipleDates ? (
        /* Multidate mode: show only the manage link and info */
        <div className="space-y-3">
          <button
            onClick={() => setShowDateConfigModal(true)}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
          >
            Manage Split Dates
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div className="text-xs text-purple-600 bg-purple-50 border border-purple-100 rounded px-3 py-2">
            This tower has {dateConfig.length} different effective dates
          </div>
        </div>
      ) : (
        /* Single date mode: show editable date fields */
        <>
          <PolicyTermEditor
            datesTbd={datesTbd}
            effectiveDate={effectiveDate}
            expirationDate={expirationDate}
            onDatesChange={handleDatesChange}
            onTbdToggle={handleTbdToggle}
            headerAction={
              <button
                onClick={() => setShowDateConfigModal(true)}
                className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
              >
                Manage Split Dates
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            }
          />
        </>
      )}

      {/* Date Config Modal */}
      {showDateConfigModal && (
        <DateConfigModal
          dateConfig={dateConfig || [{ effective: datesTbd ? 'TBD' : effectiveDate, attachment_min: 0 }]}
          layers={tower}
          policyEffective={effectiveDate}
          policyExpiration={expirationDate}
          onApply={handleDateConfigApply}
          onClose={() => setShowDateConfigModal(false)}
        />
      )}
    </div>
  );
}
