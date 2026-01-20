import { useState, useEffect } from 'react';

/**
 * NotesCard - Simple notes editing card for quote mode
 *
 * Displays quote notes with inline editing capability.
 * Hidden in submission mode since notes are per-quote.
 */
export default function NotesCard({ structure, onSave }) {
  const [notes, setNotes] = useState(structure?.notes || '');
  const [isEditing, setIsEditing] = useState(false);

  // Sync notes when structure changes
  useEffect(() => {
    setNotes(structure?.notes || '');
  }, [structure?.id, structure?.notes]);

  // Save notes when done editing
  const handleDone = () => {
    if (notes !== structure?.notes) {
      onSave?.(structure?.id, { notes });
    }
    setIsEditing(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="h-9 px-4 flex items-center justify-between bg-gray-50 border-b border-gray-200">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">Notes</h3>
        <button
          onClick={() => isEditing ? handleDone() : setIsEditing(true)}
          className="text-xs text-purple-600 hover:text-purple-700 font-medium leading-none"
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>
      <div className="p-4">
        {isEditing ? (
          <textarea
            className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none"
            rows={3}
            placeholder="Add notes about this quote (pricing rationale, broker communications, etc.)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        ) : notes ? (
          <p className="text-sm text-gray-600">{notes}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">No notes added</p>
        )}
      </div>
    </div>
  );
}
