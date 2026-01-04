import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubmission, updateSubmission, calculatePremium, createQuoteOption } from '../api/client';

// Format compact currency
function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

// Format full currency
function formatCurrency(value) {
  if (!value) return '—';
  return `$${value.toLocaleString()}`;
}

export default function RatingPage() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  // Local state for rating parameters
  const [retention, setRetention] = useState(25000);
  const [hazard, setHazard] = useState(null);
  const [controlAdj, setControlAdj] = useState(0);
  const [retroDate, setRetroDate] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);

  // Premium grid state - calculated for each limit
  const [premiumGrid, setPremiumGrid] = useState({});
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState(null);

  // Initialize from submission data
  useEffect(() => {
    if (submission && !hasInitialized) {
      setHazard(submission.hazard_override || null);
      setRetroDate(submission.default_retroactive_date || '');
      if (submission.control_overrides?.overall) {
        setControlAdj(submission.control_overrides.overall);
      }
      setHasInitialized(true);
    }
  }, [submission, hasInitialized]);

  // Calculate premiums whenever parameters change
  useEffect(() => {
    if (!submissionId || !hasInitialized) return;

    const calculateGrid = async () => {
      setCalculating(true);
      setCalcError(null);

      const limits = [1_000_000, 2_000_000, 3_000_000, 5_000_000];
      const results = {};

      try {
        for (const limit of limits) {
          const res = await calculatePremium(submissionId, {
            limit,
            retention,
            hazard_override: hazard,
            control_adjustment: controlAdj,
          });
          results[limit] = res.data;
        }
        setPremiumGrid(results);
      } catch (err) {
        console.error('Premium calculation error:', err);
        setCalcError(err.response?.data?.detail || 'Failed to calculate premium');
      } finally {
        setCalculating(false);
      }
    };

    calculateGrid();
  }, [submissionId, retention, hazard, controlAdj, hasInitialized]);

  // Update submission mutation
  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['submission', submissionId]);
    },
  });

  // Create quote mutation
  const createQuoteMutation = useMutation({
    mutationFn: (data) => createQuoteOption(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['quotes', submissionId]);
      // Navigate to Quote tab
      navigate(`/submissions/${submissionId}/quote`);
    },
  });

  // Handle hazard change - save to DB
  const handleHazardChange = (value) => {
    const newHazard = value === '' ? null : Number(value);
    setHazard(newHazard);
    updateMutation.mutate({ hazard_override: newHazard });
  };

  // Handle control adjustment change - save to DB
  const handleControlAdjChange = (value) => {
    const newAdj = Number(value);
    setControlAdj(newAdj);
    updateMutation.mutate({
      control_overrides: { overall: newAdj }
    });
  };

  // Handle retro date change
  const handleRetroChange = (value) => {
    setRetroDate(value);
    if (value !== 'custom') {
      updateMutation.mutate({ default_retroactive_date: value || null });
    }
  };

  // Create quote from rating grid
  const handleCreateQuote = (limit) => {
    const premium = premiumGrid[limit];
    const quoteName = `$${limit / 1_000_000}M Primary @ ${formatCompact(retention)} Retention`;

    createQuoteMutation.mutate({
      quote_name: quoteName,
      primary_retention: retention,
      policy_form: 'claims_made',
      tower_json: [
        {
          carrier: 'CMAI',
          limit: limit,
          attachment: 0,
          premium: premium?.risk_adjusted_premium || null
        }
      ],
    });
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  // Options
  const retentionOptions = [
    { value: 25000, label: '$25K' },
    { value: 50000, label: '$50K' },
    { value: 100000, label: '$100K' },
    { value: 150000, label: '$150K' },
    { value: 250000, label: '$250K' },
  ];

  const hazardOptions = [
    { value: '', label: 'Auto-detect' },
    { value: 1, label: '1 - Low' },
    { value: 2, label: '2 - Below Avg' },
    { value: 3, label: '3 - Average' },
    { value: 4, label: '4 - Above Avg' },
    { value: 5, label: '5 - High' },
  ];

  const adjOptions = [
    { value: -0.15, label: '-15%' },
    { value: -0.10, label: '-10%' },
    { value: -0.05, label: '-5%' },
    { value: 0, label: 'None' },
    { value: 0.05, label: '+5%' },
    { value: 0.10, label: '+10%' },
    { value: 0.15, label: '+15%' },
  ];

  const retroOptions = [
    { value: '', label: '—' },
    { value: 'Full Prior Acts', label: 'Full Prior Acts' },
    { value: 'Inception', label: 'Inception' },
    { value: 'custom', label: 'Custom...' },
  ];

  const limits = [1_000_000, 2_000_000, 3_000_000, 5_000_000];

  // Get detected hazard class from first result
  const detectedHazard = Object.values(premiumGrid)[0]?.breakdown?.hazard_class;
  const industrySlug = Object.values(premiumGrid)[0]?.breakdown?.industry_slug;

  return (
    <div className="space-y-6">
      {/* Rating Parameters */}
      <div className="card">
        <h3 className="form-section-title">Rating Parameters</h3>
        <div className="grid grid-cols-4 gap-6">
          <div>
            <label className="form-label">Retention</label>
            <select
              className="form-select"
              value={retention}
              onChange={(e) => setRetention(Number(e.target.value))}
            >
              {retentionOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Hazard Class</label>
            <select
              className="form-select"
              value={hazard ?? ''}
              onChange={(e) => handleHazardChange(e.target.value)}
            >
              {hazardOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {!hazard && detectedHazard && (
              <p className="text-xs text-gray-500 mt-1">Detected: {detectedHazard}</p>
            )}
          </div>

          <div>
            <label className="form-label">Control Adjustment</label>
            <select
              className="form-select"
              value={controlAdj}
              onChange={(e) => handleControlAdjChange(e.target.value)}
            >
              {adjOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Retroactive Date</label>
            <select
              className="form-select"
              value={retroDate}
              onChange={(e) => handleRetroChange(e.target.value)}
            >
              {retroOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {updateMutation.isPending && (
          <p className="text-sm text-gray-500 mt-2">Saving...</p>
        )}
      </div>

      {/* Premium Grid */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="form-section-title mb-0 pb-0 border-0">Premium by Limit</h3>
          {calculating && (
            <span className="text-sm text-gray-500">Calculating...</span>
          )}
        </div>

        {calcError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-700 text-sm">{calcError}</p>
          </div>
        )}

        {!submission?.annual_revenue ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">
              No revenue set for this submission. Add revenue on the Account tab to calculate premiums.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Limit</th>
                  <th className="table-header">Technical</th>
                  <th className="table-header">Risk-Adjusted</th>
                  <th className="table-header">Rate/Million</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {limits.map(limit => {
                  const result = premiumGrid[limit] || {};
                  const hasError = result.error;

                  return (
                    <tr key={limit} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{formatCompact(limit)}</td>
                      <td className="table-cell text-gray-600">
                        {calculating ? '...' : hasError ? '—' : formatCurrency(result.technical_premium)}
                      </td>
                      <td className="table-cell text-blue-600 font-medium">
                        {calculating ? '...' : hasError ? '—' : formatCurrency(result.risk_adjusted_premium)}
                      </td>
                      <td className="table-cell text-gray-600">
                        {calculating ? '...' : hasError ? '—' :
                          result.rate_per_mil ? formatCurrency(Math.round(result.rate_per_mil)) : '—'}
                      </td>
                      <td className="table-cell">
                        <button
                          className="btn btn-primary text-sm py-1"
                          onClick={() => handleCreateQuote(limit)}
                          disabled={calculating || createQuoteMutation.isPending || hasError}
                        >
                          {createQuoteMutation.isPending ? 'Creating...' : 'Create Quote'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rating Factors */}
      <div className="card">
        <h3 className="form-section-title">Rating Factors</h3>
        <div className="grid grid-cols-4 gap-6">
          <div className="metric-card">
            <div className="metric-label">Revenue</div>
            <div className="metric-value text-lg">
              {submission?.annual_revenue ? formatCompact(submission.annual_revenue) : '—'}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Industry</div>
            <div className="metric-value text-lg truncate" title={submission?.naics_primary_title}>
              {submission?.naics_primary_title || '—'}
            </div>
            {industrySlug && industrySlug !== submission?.naics_primary_title && (
              <p className="text-xs text-gray-500 mt-1 truncate" title={industrySlug}>
                Mapped: {industrySlug.replace(/_/g, ' ')}
              </p>
            )}
          </div>
          <div className="metric-card">
            <div className="metric-label">Hazard Class</div>
            <div className="metric-value text-lg">
              {hazard || detectedHazard || 'Auto'}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Retention</div>
            <div className="metric-value text-lg">
              {formatCompact(retention)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
