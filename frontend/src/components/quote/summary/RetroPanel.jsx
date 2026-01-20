import { useOptimisticMutation } from '../../../hooks/useOptimisticMutation';
import { updateQuoteOption } from '../../../api/client';
import RetroScheduleEditor from '../../RetroSelector';

/**
 * RetroPanel - Retro schedule editor for quote mode
 *
 * Small wrapper around RetroScheduleEditor that handles the structure mutation.
 * Used in the expanded Retro card when in quote mode.
 */
export default function RetroPanel({ structure, submissionId }) {
  // Update structure mutation for retro schedule
  const updateStructureMutation = useOptimisticMutation({
    mutationFn: (data) => updateQuoteOption(structure.id, data),
    queryKey: ['structures', submissionId],
    optimisticUpdate: (old, data) =>
      (old || []).map(s => s.id === structure.id ? { ...s, ...data } : s),
  });

  // Get excluded coverages from aggregate_coverages (value === 0 means excluded)
  const aggregateCoverages = structure?.coverages?.aggregate_coverages || {};
  const excludedCoverages = Object.entries(aggregateCoverages)
    .filter(([_, value]) => value === 0)
    .map(([id]) => {
      // Map coverage IDs to display names used in retro schedule
      if (id === 'tech_eo') return 'Tech E&O';
      if (id === 'network_security_privacy') return 'Cyber';
      return id;
    });

  return (
    <div className="space-y-4">
      <RetroScheduleEditor
        schedule={structure?.retro_schedule || []}
        onChange={(schedule) => {
          // Filter out excluded coverages before saving to keep data clean
          const filteredSchedule = schedule.filter(entry => !excludedCoverages.includes(entry.coverage));
          updateStructureMutation.mutate({ retro_schedule: filteredSchedule });
        }}
        excludedCoverages={excludedCoverages}
        showHeader={true}
        showEmptyState={true}
        addButtonText="+ Add Restriction"
        compact={false}
      />
    </div>
  );
}
