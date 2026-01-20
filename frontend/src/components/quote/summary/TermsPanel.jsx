import { useOptimisticMutation } from '../../../hooks/useOptimisticMutation';
import { updateVariation } from '../../../api/client';
import PolicyTermEditor from '../../PolicyTermEditor';

/**
 * TermsPanel - Policy term editor for quote mode
 *
 * Small wrapper around PolicyTermEditor that handles the variation mutation.
 * Used in the expanded Terms card when in quote mode.
 */
export default function TermsPanel({ structure, variation, submission, submissionId }) {
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
  const datesTbd = variation?.dates_tbd || false;
  const effectiveDate = variation?.effective_date_override || structure?.effective_date || submission?.effective_date || '';
  const expirationDate = variation?.expiration_date_override || structure?.expiration_date || submission?.expiration_date || '';

  const handleDatesChange = ({ datesTbd: newDatesTbd, effectiveDate: newEffectiveDate, expirationDate: newExpirationDate }) => {
    updateMutation.mutate({
      dates_tbd: newDatesTbd,
      effective_date_override: newEffectiveDate || null,
      expiration_date_override: newExpirationDate || null,
    });
  };

  const handleTbdToggle = (newTbd) => {
    updateMutation.mutate({
      dates_tbd: newTbd,
      ...(newTbd ? { effective_date_override: null, expiration_date_override: null } : {}),
    });
  };

  return (
    <PolicyTermEditor
      datesTbd={datesTbd}
      effectiveDate={effectiveDate}
      expirationDate={expirationDate}
      onDatesChange={handleDatesChange}
      onTbdToggle={handleTbdToggle}
    />
  );
}
