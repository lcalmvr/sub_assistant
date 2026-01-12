import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getEnhancementTypes,
  getQuoteEnhancements,
  addQuoteEnhancement,
  updateQuoteEnhancement,
  removeQuoteEnhancement,
} from '../api/client';
import EnhancementForm from './EnhancementForm';

/**
 * EnhancementsPanel - Displays and manages enhancements for a quote option
 *
 * Enhancements are data components (Additional Insureds, Modified ERP, etc.)
 * that auto-attach corresponding endorsements when added.
 */
export default function EnhancementsPanel({ quoteId, position = 'primary', allQuoteOptions = [] }) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [showAddSelector, setShowAddSelector] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState('');

  // Query for enhancement types available for this position
  const { data: typesData } = useQuery({
    queryKey: ['enhancement-types', position],
    queryFn: () => getEnhancementTypes(position, true).then(res => res.data),
  });

  // Query for enhancements on this quote
  const { data: enhancementsData, refetch: refetchEnhancements } = useQuery({
    queryKey: ['quote-enhancements', quoteId],
    queryFn: () => getQuoteEnhancements(quoteId).then(res => res.data),
    enabled: !!quoteId,
  });

  // Add enhancement mutation
  const addMutation = useMutation({
    mutationFn: (data) => addQuoteEnhancement(quoteId, data),
    onSuccess: () => {
      refetchEnhancements();
      queryClient.invalidateQueries({ queryKey: ['quoteEndorsements', quoteId] });
      setShowAddSelector(false);
      setSelectedTypeId('');
    },
  });

  // Update enhancement mutation
  const updateMutation = useMutation({
    mutationFn: ({ enhancementId, data }) => updateQuoteEnhancement(enhancementId, data),
    onSuccess: () => {
      refetchEnhancements();
      setExpandedId(null); // Collapse after save
    },
    onError: (error) => {
      console.error('Failed to update enhancement:', error);
      alert('Failed to save changes. Please try again.');
    },
  });

  // Remove enhancement mutation
  const removeMutation = useMutation({
    mutationFn: (enhancementId) => removeQuoteEnhancement(enhancementId, true),
    onSuccess: () => {
      refetchEnhancements();
      queryClient.invalidateQueries({ queryKey: ['quoteEndorsements', quoteId] });
    },
  });

  const enhancementTypes = typesData?.enhancement_types || [];
  const enhancements = enhancementsData?.enhancements || [];

  // Get types that haven't been added yet
  const usedTypeCodes = enhancements.map(e => e.type_code);
  const availableTypes = enhancementTypes.filter(t => !usedTypeCodes.includes(t.code));

  const handleAddEnhancement = (typeId, formData) => {
    addMutation.mutate({
      enhancement_type_id: typeId,
      data: formData,
      auto_attach_endorsement: true,
    });
  };

  const handleUpdateEnhancement = (enhancementId, formData) => {
    updateMutation.mutate({
      enhancementId,
      data: formData,
    });
  };

  const handleRemoveEnhancement = (enhancementId, typeName) => {
    if (window.confirm(`Remove "${typeName}"? This will also remove the linked endorsement.`)) {
      removeMutation.mutate(enhancementId);
    }
  };

  // Format data summary for display
  const formatSummary = (data, schema) => {
    if (!data) return '';

    // Handle array types (like additional insureds)
    if (Array.isArray(data)) {
      if (data.length === 0) return 'No entries';
      const firstItem = data[0];
      const name = firstItem?.name || firstItem?.entity_name || 'Entry';
      if (data.length === 1) return name;
      return `${name} + ${data.length - 1} more`;
    }

    // Handle object types - show key values
    const parts = [];
    // Hammer clause - show split
    if (data.insurer_percentage !== undefined && data.insured_percentage !== undefined) {
      parts.push(`${data.insurer_percentage}/${data.insured_percentage} split`);
    }
    if (data.basic_period_days) parts.push(`${data.basic_period_days} days`);
    if (data.revenue_threshold) {
      const val = typeof data.revenue_threshold === 'number'
        ? `$${(data.revenue_threshold / 1000000).toFixed(1)}M`
        : data.revenue_threshold;
      parts.push(val);
    }
    return parts.join(' · ') || 'Configured';
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h4 className="form-section-title mb-0">Enhancements & Modifications</h4>
        {availableTypes.length > 0 && (
          <button
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-600 transition-colors"
            onClick={() => setShowAddSelector(!showAddSelector)}
          >
            + Add Enhancement
          </button>
        )}
      </div>

      {/* Add Enhancement Selector */}
      {showAddSelector && (
        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="text-sm font-medium text-purple-900 mb-2">Add Enhancement</div>
          <select
            className="form-select text-sm w-full"
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
          >
            <option value="">Select enhancement type...</option>
            {availableTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
                {type.description && ` - ${type.description}`}
              </option>
            ))}
          </select>

          {selectedTypeId && (() => {
            const selectedType = enhancementTypes.find(t => t.id === selectedTypeId);
            if (!selectedType) return null;
            return (
              <div className="mt-3">
                <EnhancementForm
                  schema={selectedType.data_schema}
                  initialData={{}}
                  onSubmit={(formData) => handleAddEnhancement(selectedTypeId, formData)}
                  onCancel={() => {
                    setShowAddSelector(false);
                    setSelectedTypeId('');
                  }}
                  submitLabel={addMutation.isPending ? 'Adding...' : 'Add Enhancement'}
                  isSubmitting={addMutation.isPending}
                />
              </div>
            );
          })()}
        </div>
      )}

      {/* Enhancements List */}
      <div className="space-y-2">
        {enhancements.map((enhancement) => {
          const isExpanded = expandedId === enhancement.id;
          const schema = enhancement.data_schema || {};

          return (
            <div
              key={enhancement.id}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : enhancement.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                  <div>
                    <div className="font-medium text-gray-900 text-sm">
                      {enhancement.type_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatSummary(enhancement.data, schema)}
                      {enhancement.linked_endorsement_code && (
                        <span className="ml-2 text-purple-600">
                          → {enhancement.linked_endorsement_code}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveEnhancement(enhancement.id, enhancement.type_name);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-4 py-3 border-t border-gray-200 bg-white">
                  <EnhancementForm
                    schema={schema}
                    initialData={enhancement.data || {}}
                    onSubmit={(formData) => handleUpdateEnhancement(enhancement.id, formData)}
                    submitLabel={updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                    isSubmitting={updateMutation.isPending}
                    showCancel={false}
                  />
                </div>
              )}
            </div>
          );
        })}

        {enhancements.length === 0 && !showAddSelector && (
          <div className="text-center text-gray-500 py-4 text-sm">
            No enhancements added yet.
            {availableTypes.length > 0 && (
              <button
                className="ml-1 text-purple-600 hover:underline"
                onClick={() => setShowAddSelector(true)}
              >
                Add one
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
