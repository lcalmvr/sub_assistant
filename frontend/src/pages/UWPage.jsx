import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubmission, updateSubmission } from '../api/client';

// Format currency compact
function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

// Parse markdown-like text into formatted sections
function FormattedText({ text }) {
  if (!text || typeof text !== 'string') return <p className="text-gray-500 italic">No data available</p>;

  const lines = text.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        if (line.startsWith('## ')) {
          return (
            <h4 key={idx} className="font-semibold text-gray-900 mt-4 first:mt-0">
              {line.replace('## ', '')}
            </h4>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h5 key={idx} className="font-medium text-gray-800 mt-3">
              {line.replace('### ', '')}
            </h5>
          );
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return (
            <p key={idx} className="font-semibold text-gray-800">
              {line.replace(/\*\*/g, '')}
            </p>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <div key={idx} className="flex gap-2 text-gray-700 ml-2">
              <span className="text-gray-400">•</span>
              <span>{line.replace('- ', '').replace(/\*\*/g, '')}</span>
            </div>
          );
        }
        if (line.trim()) {
          return <p key={idx} className="text-gray-700">{line}</p>;
        }
        return null;
      })}
    </div>
  );
}

// Risk indicator badge
function RiskBadge({ level }) {
  const config = {
    low: { label: 'Low Risk', class: 'badge-quoted' },
    medium: { label: 'Medium Risk', class: 'badge-renewal' },
    high: { label: 'High Risk', class: 'badge-declined' },
  };
  const { label, class: badgeClass } = config[level] || config.medium;
  return <span className={`badge ${badgeClass}`}>{label}</span>;
}

// NIST Control card
function ControlCard({ name, status, description }) {
  const statusColors = {
    implemented: 'bg-green-100 text-green-800 border-green-200',
    partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    not_implemented: 'bg-red-100 text-red-800 border-red-200',
    unknown: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const statusLabels = {
    implemented: 'Implemented',
    partial: 'Partial',
    not_implemented: 'Not Implemented',
    unknown: 'Unknown',
  };

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-gray-900 text-sm">{name}</span>
        <span className={`text-xs px-2 py-0.5 rounded border ${statusColors[status] || statusColors.unknown}`}>
          {statusLabels[status] || status}
        </span>
      </div>
      {description && (
        <p className="text-xs text-gray-600">{description}</p>
      )}
    </div>
  );
}

// Cyber exposure item
function ExposureItem({ exposure }) {
  if (typeof exposure === 'string') {
    return (
      <div className="flex gap-2 text-gray-700">
        <span className="text-purple-500">•</span>
        <span>{exposure}</span>
      </div>
    );
  }

  return (
    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-purple-900">{exposure.name || exposure.type}</span>
        {exposure.severity && <RiskBadge level={exposure.severity} />}
      </div>
      {exposure.description && (
        <p className="text-sm text-purple-700">{exposure.description}</p>
      )}
    </div>
  );
}

export default function UWPage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();

  // Local state for editable fields
  const [hazardOverride, setHazardOverride] = useState('');
  const [controlAdj, setControlAdj] = useState(0);
  const [hasInitialized, setHasInitialized] = useState(false);

  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  // Initialize from submission data
  useEffect(() => {
    if (submission && !hasInitialized) {
      setHazardOverride(submission.hazard_override?.toString() || '');
      if (submission.control_overrides?.overall) {
        setControlAdj(submission.control_overrides.overall);
      }
      setHasInitialized(true);
    }
  }, [submission, hasInitialized]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['submission', submissionId]);
    },
  });

  // Handle hazard change
  const handleHazardChange = (value) => {
    setHazardOverride(value);
    const newHazard = value === '' ? null : Number(value);
    updateMutation.mutate({ hazard_override: newHazard });
  };

  // Handle control adjustment change
  const handleControlAdjChange = (value) => {
    const newAdj = Number(value);
    setControlAdj(newAdj);
    updateMutation.mutate({
      control_overrides: { overall: newAdj }
    });
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  // Parse cyber exposures (could be JSON object, array, or string)
  let cyberExposures = [];
  if (submission?.cyber_exposures) {
    if (Array.isArray(submission.cyber_exposures)) {
      cyberExposures = submission.cyber_exposures;
    } else if (typeof submission.cyber_exposures === 'object') {
      cyberExposures = Object.entries(submission.cyber_exposures).map(([key, value]) => ({
        name: key,
        ...value,
      }));
    } else if (typeof submission.cyber_exposures === 'string') {
      cyberExposures = submission.cyber_exposures.split('\n').filter(Boolean);
    }
  }

  // Parse NIST controls (could be JSON object or array)
  let nistControls = [];
  if (submission?.nist_controls) {
    if (Array.isArray(submission.nist_controls)) {
      nistControls = submission.nist_controls;
    } else if (typeof submission.nist_controls === 'object') {
      nistControls = Object.entries(submission.nist_controls).map(([key, value]) => ({
        name: key,
        ...(typeof value === 'object' ? value : { status: value }),
      }));
    }
  }

  // Hazard options
  const hazardOptions = [
    { value: '', label: 'Auto-detect' },
    { value: '1', label: '1 - Low' },
    { value: '2', label: '2 - Below Average' },
    { value: '3', label: '3 - Average' },
    { value: '4', label: '4 - Above Average' },
    { value: '5', label: '5 - High' },
  ];

  // Control adjustment options
  const adjOptions = [
    { value: -0.20, label: '-20% (Strong Controls)' },
    { value: -0.15, label: '-15%' },
    { value: -0.10, label: '-10%' },
    { value: -0.05, label: '-5%' },
    { value: 0, label: 'No Adjustment' },
    { value: 0.05, label: '+5%' },
    { value: 0.10, label: '+10%' },
    { value: 0.15, label: '+15%' },
    { value: 0.20, label: '+20% (Weak Controls)' },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="metric-card">
          <div className="metric-label">Revenue</div>
          <div className="metric-value">{formatCompact(submission?.annual_revenue)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Industry</div>
          <div className="metric-value text-base truncate" title={submission?.naics_primary_title}>
            {submission?.naics_primary_title || '—'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">NAICS Code</div>
          <div className="metric-value">{submission?.naics_primary_code || '—'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Status</div>
          <div className="metric-value text-base">
            {submission?.status?.replace(/_/g, ' ') || '—'}
          </div>
        </div>
      </div>

      {/* Rating Overrides - Editable */}
      <div className="card">
        <h3 className="form-section-title">Underwriting Adjustments</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="form-label">Hazard Class Override</label>
            <select
              className="form-select"
              value={hazardOverride}
              onChange={(e) => handleHazardChange(e.target.value)}
            >
              {hazardOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Override the industry-based hazard classification
            </p>
          </div>
          <div>
            <label className="form-label">Control Quality Adjustment</label>
            <select
              className="form-select"
              value={controlAdj}
              onChange={(e) => handleControlAdjChange(e.target.value)}
            >
              {adjOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Adjust premium based on security control quality
            </p>
          </div>
        </div>
        {updateMutation.isPending && (
          <p className="text-sm text-gray-500 mt-2">Saving...</p>
        )}
        {updateMutation.isSuccess && (
          <p className="text-sm text-green-600 mt-2">Saved</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Business Summary */}
        <div className="card">
          <h3 className="form-section-title">Business Summary</h3>
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {submission?.business_summary || 'No business summary available'}
            </p>
          </div>
        </div>

        {/* Key Points */}
        <div className="card">
          <h3 className="form-section-title">Key Points</h3>
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            <FormattedText text={submission?.bullet_point_summary} />
          </div>
        </div>
      </div>

      {/* Cyber Exposures */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="form-section-title mb-0 pb-0 border-0">Cyber Exposures</h3>
          {cyberExposures.length > 0 && (
            <span className="text-sm text-gray-500">{cyberExposures.length} identified</span>
          )}
        </div>
        {cyberExposures.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {cyberExposures.map((exposure, idx) => (
              <ExposureItem key={idx} exposure={exposure} />
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-gray-500">No cyber exposures identified</p>
          </div>
        )}
      </div>

      {/* NIST Controls Summary */}
      <div className="card">
        <h3 className="form-section-title">Security Controls Assessment</h3>
        {submission?.nist_controls_summary ? (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <FormattedText text={submission.nist_controls_summary} />
          </div>
        ) : null}

        {nistControls.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {nistControls.map((control, idx) => (
              <ControlCard
                key={idx}
                name={control.name}
                status={control.status}
                description={control.description}
              />
            ))}
          </div>
        ) : !submission?.nist_controls_summary ? (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-gray-500">No security controls data available</p>
          </div>
        ) : null}
      </div>

      {/* AI Recommendation Preview */}
      {submission?.ai_recommendation && (
        <div className="card">
          <h3 className="form-section-title">AI Recommendation</h3>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <FormattedText text={submission.ai_recommendation} />
          </div>
        </div>
      )}

      {/* Guideline Citations */}
      {submission?.ai_guideline_citations && (
        <div className="card">
          <h3 className="form-section-title">Guideline Citations</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <FormattedText text={submission.ai_guideline_citations} />
          </div>
        </div>
      )}
    </div>
  );
}
