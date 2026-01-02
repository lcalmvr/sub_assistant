import { useState, useEffect, useMemo } from 'react';

/**
 * RetroScheduleEditor - Smart retro schedule with shortcut buttons
 *
 * Props:
 *   - schedule: Array of { coverage, retro, date?, custom_text? }
 *   - notes: String
 *   - position: 'primary' | 'excess'
 *   - coverages: Object with coverage flags (from quote.coverages)
 *   - onChange: (schedule, notes) => void
 *   - readOnly: boolean
 */

// Retro type options
const RETRO_TYPES = {
  full_prior_acts: { label: 'Full Prior Acts', short: 'FPA' },
  follow_form: { label: 'Follow Form', short: 'FF', excessOnly: true },
  inception: { label: 'Inception', short: 'Inc' },
  date: { label: 'Date', short: 'Date' },
  custom: { label: 'Custom', short: 'Custom' },
};

// Coverage type display names
const COVERAGE_LABELS = {
  cyber: 'Cyber',
  tech_eo: 'Tech E&O',
  do: 'D&O',
  epl: 'EPL',
  fiduciary: 'Fiduciary',
};

// Detect enabled coverages from quote coverages object
function detectCoverages(coveragesObj, policyForm, sublimits) {
  const enabled = [];

  // Normalize policy form
  const form = (policyForm || '').toLowerCase();

  // Cyber is present for most forms
  if (form.includes('cyber') || form === 'claims_made' || !form) {
    enabled.push('cyber');
  }

  // Tech E&O detection
  const hasTechInCoverages = coveragesObj?.aggregate_coverages?.tech_eo > 0;
  const hasTechInForm = form.includes('tech');
  const hasTechInSublimits = sublimits?.some(s =>
    s.coverage?.toLowerCase().includes('tech') ||
    s.coverage?.toLowerCase().includes('e&o') ||
    s.coverage_normalized?.some(c => c.toLowerCase().includes('tech'))
  );

  if (hasTechInCoverages || hasTechInForm || hasTechInSublimits) {
    enabled.push('tech_eo');
  }

  // Default: if no coverages detected, at least show Cyber
  if (enabled.length === 0) {
    enabled.push('cyber');
  }

  return enabled;
}

// Get smart defaults based on position and coverages
function getSmartDefaults(position, enabledCoverages) {
  const defaults = [];

  enabledCoverages.forEach(cov => {
    let retro = 'full_prior_acts';

    if (position === 'excess') {
      retro = cov === 'cyber' ? 'follow_form' : 'inception';
    } else {
      // Primary
      retro = cov === 'cyber' ? 'full_prior_acts' : 'inception';
    }

    defaults.push({ coverage: cov, retro });
  });

  return defaults;
}

// Format retro value for display
function formatRetroDisplay(entry) {
  if (!entry) return '—';

  switch (entry.retro) {
    case 'full_prior_acts':
      return 'Full Prior Acts';
    case 'follow_form':
      return 'Follow Form';
    case 'inception':
      return 'Inception';
    case 'date':
      return entry.date || 'Date not set';
    case 'custom':
      return entry.custom_text || 'Custom';
    default:
      return entry.retro || '—';
  }
}

export default function RetroScheduleEditor({
  schedule = [],
  notes = '',
  position = 'primary',
  coverages = {},
  policyForm = '',
  sublimits = [],
  onChange,
  readOnly = false
}) {
  // Detect which coverages are enabled
  const enabledCoverages = useMemo(() =>
    detectCoverages(coverages, policyForm, sublimits),
    [coverages, policyForm, sublimits]
  );

  // Get smart defaults
  const smartDefaults = useMemo(() =>
    getSmartDefaults(position, enabledCoverages),
    [position, enabledCoverages]
  );

  // Initialize schedule from props or smart defaults
  const [localSchedule, setLocalSchedule] = useState(() => {
    if (schedule && schedule.length > 0) {
      return schedule;
    }
    return smartDefaults;
  });

  const [localNotes, setLocalNotes] = useState(notes || '');
  const [customDate, setCustomDate] = useState({});
  const [customText, setCustomText] = useState({});

  // Sync with external schedule prop
  useEffect(() => {
    if (schedule && schedule.length > 0) {
      setLocalSchedule(schedule);
      // Initialize custom fields
      const dates = {};
      const texts = {};
      schedule.forEach(entry => {
        if (entry.date) dates[entry.coverage] = entry.date;
        if (entry.custom_text) texts[entry.coverage] = entry.custom_text;
      });
      setCustomDate(dates);
      setCustomText(texts);
    } else if (smartDefaults.length > 0) {
      setLocalSchedule(smartDefaults);
    }
  }, [schedule, smartDefaults]);

  useEffect(() => {
    setLocalNotes(notes || '');
  }, [notes]);

  const handleRetroChange = (coverage, retroType) => {
    const newSchedule = localSchedule.map(entry => {
      if (entry.coverage === coverage) {
        const updated = { coverage, retro: retroType };
        if (retroType === 'date') {
          updated.date = customDate[coverage] || '';
        } else if (retroType === 'custom') {
          updated.custom_text = customText[coverage] || '';
        }
        return updated;
      }
      return entry;
    });

    // If coverage not in schedule, add it
    if (!newSchedule.find(e => e.coverage === coverage)) {
      const newEntry = { coverage, retro: retroType };
      if (retroType === 'date') newEntry.date = customDate[coverage] || '';
      if (retroType === 'custom') newEntry.custom_text = customText[coverage] || '';
      newSchedule.push(newEntry);
    }

    setLocalSchedule(newSchedule);
  };

  const handleDateChange = (coverage, date) => {
    setCustomDate(prev => ({ ...prev, [coverage]: date }));
    const newSchedule = localSchedule.map(entry => {
      if (entry.coverage === coverage && entry.retro === 'date') {
        return { ...entry, date };
      }
      return entry;
    });
    setLocalSchedule(newSchedule);
  };

  const handleCustomTextChange = (coverage, text) => {
    setCustomText(prev => ({ ...prev, [coverage]: text }));
    const newSchedule = localSchedule.map(entry => {
      if (entry.coverage === coverage && entry.retro === 'custom') {
        return { ...entry, custom_text: text };
      }
      return entry;
    });
    setLocalSchedule(newSchedule);
  };

  const handleResetDefaults = () => {
    setLocalSchedule(smartDefaults);
    setCustomDate({});
    setCustomText({});
  };

  const handleSave = () => {
    // Clean up schedule - remove empty custom fields
    const cleanSchedule = localSchedule.map(entry => {
      const clean = { coverage: entry.coverage, retro: entry.retro };
      if (entry.retro === 'date' && entry.date) clean.date = entry.date;
      if (entry.retro === 'custom' && entry.custom_text) clean.custom_text = entry.custom_text;
      return clean;
    });
    onChange(cleanSchedule, localNotes || null);
  };

  const getEntryForCoverage = (cov) => {
    // Check saved schedule first, then fall back to smart defaults
    const fromSchedule = localSchedule.find(e => e.coverage === cov);
    if (fromSchedule) return fromSchedule;

    const fromDefaults = smartDefaults.find(e => e.coverage === cov);
    if (fromDefaults) return fromDefaults;

    return { coverage: cov, retro: null };
  };

  // Read-only display
  if (readOnly) {
    // Show retro for detected coverages only (matches what should print on quote)
    if (enabledCoverages.length === 0) {
      return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No coverages configured</span>;
    }

    return (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {enabledCoverages.map(cov => {
            const entry = getEntryForCoverage(cov);
            return (
              <div key={cov} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 500, minWidth: 80 }}>{COVERAGE_LABELS[cov]}</span>
                <span style={{
                  padding: '2px 10px',
                  background: '#f3f4f6',
                  borderRadius: 12,
                  fontSize: 13,
                }}>
                  {formatRetroDisplay(entry)}
                </span>
              </div>
            );
          })}
        </div>
        {localNotes && (
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 12, fontStyle: 'italic' }}>
            {localNotes}
          </p>
        )}
      </div>
    );
  }

  // Editable mode
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {enabledCoverages.map(cov => {
          const entry = getEntryForCoverage(cov);
          const currentRetro = entry.retro;

          return (
            <div key={cov} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid #f3f4f6',
            }}>
              <span style={{ fontWeight: 500, minWidth: 80, paddingTop: 6 }}>
                {COVERAGE_LABELS[cov]}
              </span>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                {Object.entries(RETRO_TYPES).map(([type, config]) => {
                  // Skip Follow Form for primary
                  if (config.excessOnly && position !== 'excess') return null;

                  const isSelected = currentRetro === type;

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleRetroChange(cov, type)}
                      style={{
                        padding: '4px 12px',
                        border: isSelected ? '2px solid #7c3aed' : '1px solid #d1d5db',
                        borderRadius: 16,
                        background: isSelected ? '#f3e8ff' : '#fff',
                        color: isSelected ? '#7c3aed' : '#374151',
                        fontSize: 13,
                        cursor: 'pointer',
                        fontWeight: isSelected ? 500 : 400,
                        transition: 'all 0.15s',
                      }}
                    >
                      {config.label}
                    </button>
                  );
                })}

                {/* Date picker when date is selected */}
                {currentRetro === 'date' && (
                  <input
                    type="date"
                    value={customDate[cov] || entry.date || ''}
                    onChange={(e) => handleDateChange(cov, e.target.value)}
                    style={{
                      padding: '4px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  />
                )}

                {/* Custom text input when custom is selected */}
                {currentRetro === 'custom' && (
                  <input
                    type="text"
                    value={customText[cov] || entry.custom_text || ''}
                    onChange={(e) => handleCustomTextChange(cov, e.target.value)}
                    placeholder="e.g., to match expiring"
                    style={{
                      padding: '4px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 13,
                      minWidth: 150,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
          Notes
        </label>
        <textarea
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          placeholder="Additional context..."
          rows={2}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 13,
            resize: 'vertical',
          }}
        />
      </div>

      {/* Actions */}
      <div style={{
        marginTop: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <button
          type="button"
          onClick={handleResetDefaults}
          style={{
            padding: '6px 12px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            color: '#6b7280',
          }}
        >
          Reset to Defaults
        </button>

        <button
          type="button"
          onClick={handleSave}
          style={{
            padding: '6px 16px',
            background: '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
