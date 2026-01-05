import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getBrkrEmployments } from '../api/client';

/**
 * Reusable broker selector component with search and dropdown.
 * Uses portal for dropdown to avoid overflow clipping issues.
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
  const inputRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

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

  // Update dropdown position when showing
  useEffect(() => {
    if (showDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [showDropdown]);

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
    ? "w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
    : "form-input";

  const dropdownContent = showDropdown && (
    <div
      className="fixed bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        zIndex: 9999,
      }}
    >
      {filteredEmployments.length > 0 ? (
        filteredEmployments.map((emp) => (
          <button
            key={emp.employment_id}
            type="button"
            className="w-full px-3 py-2.5 text-left hover:bg-purple-50 border-b border-gray-100 last:border-0"
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
  );

  return (
    <div className="relative">
      <input
        ref={inputRef}
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
      {showDropdown && createPortal(dropdownContent, document.body)}
    </div>
  );
}
