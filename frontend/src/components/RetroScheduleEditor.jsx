import { useState, useEffect } from 'react';

/**
 * RetroScheduleEditor - Editable table for per-coverage retroactive dates
 *
 * Props:
 *   - schedule: Array of { coverage, limit?, retro } objects
 *   - notes: String, free-text retro notes
 *   - onChange: (schedule, notes) => void
 *   - readOnly: boolean
 */
export default function RetroScheduleEditor({ schedule = [], notes = '', onChange, readOnly = false }) {
  const [rows, setRows] = useState(schedule.length > 0 ? schedule : [{ coverage: '', limit: '', retro: '' }]);
  const [localNotes, setLocalNotes] = useState(notes || '');

  // Sync with external schedule prop
  useEffect(() => {
    if (schedule && schedule.length > 0) {
      setRows(schedule);
    }
  }, [schedule]);

  useEffect(() => {
    setLocalNotes(notes || '');
  }, [notes]);

  const handleRowChange = (index, field, value) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const addRow = () => {
    setRows([...rows, { coverage: '', limit: '', retro: '' }]);
  };

  const removeRow = (index) => {
    if (rows.length > 1) {
      const newRows = rows.filter((_, i) => i !== index);
      setRows(newRows);
    }
  };

  const handleSave = () => {
    // Filter out empty rows
    const validRows = rows.filter(r => r.coverage?.trim() || r.retro?.trim());
    onChange(validRows.length > 0 ? validRows : null, localNotes || null);
  };

  if (readOnly) {
    // Read-only display
    if ((!schedule || schedule.length === 0) && !notes) {
      return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No retro schedule</span>;
    }

    return (
      <div>
        {schedule && schedule.length > 0 && (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: '#6b7280' }}>Coverage</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: '#6b7280' }}>Limit</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: '#6b7280' }}>Retro</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 8px' }}>{row.coverage}</td>
                  <td style={{ padding: '4px 8px', color: row.limit ? 'inherit' : '#9ca3af' }}>{row.limit || '-'}</td>
                  <td style={{ padding: '4px 8px' }}>{row.retro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {notes && (
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8, fontStyle: 'italic' }}>{notes}</p>
        )}
      </div>
    );
  }

  // Editable mode
  return (
    <div>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: '#6b7280', width: '35%' }}>Coverage</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: '#6b7280', width: '25%' }}>Limit</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500, color: '#6b7280', width: '30%' }}>Retro</th>
            <th style={{ width: '10%' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ padding: '4px 8px' }}>
                <input
                  type="text"
                  value={row.coverage || ''}
                  onChange={(e) => handleRowChange(i, 'coverage', e.target.value)}
                  placeholder="e.g., Cyber"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                />
              </td>
              <td style={{ padding: '4px 8px' }}>
                <input
                  type="text"
                  value={row.limit || ''}
                  onChange={(e) => handleRowChange(i, 'limit', e.target.value)}
                  placeholder="e.g., $1M"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                />
              </td>
              <td style={{ padding: '4px 8px' }}>
                <input
                  type="text"
                  value={row.retro || ''}
                  onChange={(e) => handleRowChange(i, 'retro', e.target.value)}
                  placeholder="Full Prior Acts"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                />
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: '2px 6px',
                    }}
                    title="Remove row"
                  >
                    x
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={addRow}
          style={{
            padding: '4px 12px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          + Add Row
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Notes</label>
        <textarea
          value={localNotes}
          onChange={(e) => setLocalNotes(e.target.value)}
          placeholder="Additional context about retro dates..."
          rows={2}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            fontSize: 13,
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleSave}
          style={{
            padding: '6px 16px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
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
