import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getBrkrEmployments } from '../api/client';

/**
 * Reusable broker selector component with search and dropdown.
 *
 * Props:
 * - value: current broker_employment_id
 * - brokerEmail: current broker_email (for display when no employment match)
 * - brokerName: current broker display name (optional)
 * - onChange: (employment) => void - called with full employment object
 * - compact: boolean - if true, uses smaller styling
 * - placeholder: string - input placeholder text
 */
export default function BrokerSelector({
  value,
  brokerEmail,
  brokerName,
  onChange,
  compact = false,
  placeholder = "Search by name, email, or company...",
}) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Fetch broker employments
  const { data: brokerEmployments } = useQuery({
    queryKey: ['brkr-employments'],
    queryFn: () => getBrkrEmployments({ active_only: true }).then(res => res.data),
  });

  // Initialize search display from current value
  useEffect(() => {
    if (value && brokerEmployments) {
      const emp = brokerEmployments.find(e => e.employment_id === value);
      if (emp) {
        setSearch(`${emp.person_name} - ${emp.org_name}`);
        return;
      }
    }
    if (brokerName) {
      setSearch(brokerName);
    } else if (brokerEmail) {
      setSearch(brokerEmail);
    }
  }, [value, brokerEmail, brokerName, brokerEmployments]);

  // Filter employments based on search
  const filteredEmployments = brokerEmployments?.filter(emp => {
    const searchLower = search.toLowerCase();
    return (
      (emp.email || '').toLowerCase().includes(searchLower) ||
      (emp.person_name || '').toLowerCase().includes(searchLower) ||
      (emp.org_name || '').toLowerCase().includes(searchLower)
    );
  }).slice(0, 10) || [];

  const handleSelect = (employment) => {
    setSearch(`${employment.person_name} - ${employment.org_name}`);
    setShowDropdown(false);
    onChange?.(employment);
  };

  const inputClass = compact
    ? "w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
    : "form-input";

  return (
    <div className="relative">
      <input
        type="text"
        className={inputClass}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        placeholder={placeholder}
      />

      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredEmployments.length > 0 ? (
            filteredEmployments.map((emp) => (
              <button
                key={emp.employment_id}
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-purple-50 border-b border-gray-100 last:border-0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(emp)}
              >
                <div className="font-medium text-gray-900">{emp.person_name}</div>
                <div className="text-sm text-gray-500">
                  {emp.email} · {emp.org_name}
                </div>
              </button>
            ))
          ) : search ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-gray-500 mb-2">No matching brokers found</p>
              <Link
                to="/brokers"
                className="text-sm text-purple-600 hover:text-purple-800 font-medium"
              >
                Go to Broker Management to add new
              </Link>
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-sm text-gray-500">
              Start typing to search brokers
            </div>
          )}
          {filteredEmployments.length > 0 && (
            <div className="border-t border-gray-200 px-3 py-2">
              <Link
                to="/brokers"
                className="text-sm text-purple-600 hover:text-purple-800 font-medium"
              >
                Manage brokers
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
