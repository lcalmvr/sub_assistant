import { useEffect, useRef, useCallback } from 'react';

/**
 * useEditMode - Handles click-outside and escape key patterns for expandable cards
 *
 * This hook encapsulates the common pattern of:
 * - Detecting clicks outside a container (while ignoring Radix popover portals)
 * - Triggering blur on active elements inside the container (to save pending edits)
 * - Handling escape key to close
 * - Calling a cleanup callback when closing
 *
 * @param {Object} options
 * @param {boolean} options.isActive - Whether this edit mode is currently active
 * @param {Function} options.onClose - Callback when the mode should close (click outside or escape)
 * @param {boolean} [options.closeOnClickOutside=true] - Whether to close on click outside
 * @param {boolean} [options.closeOnEscape=true] - Whether to close on escape key
 * @param {boolean} [options.blurActiveElement=true] - Whether to blur active element before closing
 * @param {boolean} [options.ignorePopoverClicks=true] - Whether to ignore clicks inside Radix popovers
 *
 * @returns {Object} { containerRef } - Ref to attach to the container element
 *
 * @example
 * const { containerRef } = useEditMode({
 *   isActive: expandedCard === 'endorsements',
 *   onClose: () => {
 *     setExpandedCard(null);
 *     setEditingId(null);
 *     setIsAdding(false);
 *   },
 * });
 *
 * return <div ref={containerRef}>...</div>;
 */
export function useEditMode({
  isActive,
  onClose,
  closeOnClickOutside = true,
  closeOnEscape = true,
  blurActiveElement = true,
  ignorePopoverClicks = true,
}) {
  const containerRef = useRef(null);

  // Memoize the close handler to avoid recreating event listeners
  const handleClose = useCallback(() => {
    // Blur active element first to trigger any pending saves
    if (blurActiveElement && containerRef.current) {
      if (document.activeElement && containerRef.current.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }
    onClose();
  }, [onClose, blurActiveElement]);

  // Click outside handler
  useEffect(() => {
    if (!isActive || !closeOnClickOutside) return;

    const handleClickOutside = (e) => {
      if (!containerRef.current) return;

      // Check if click is inside the container
      if (containerRef.current.contains(e.target)) return;

      // Optionally ignore clicks inside Radix popover portals
      if (ignorePopoverClicks) {
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;
      }

      handleClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isActive, closeOnClickOutside, ignorePopoverClicks, handleClose]);

  // Escape key handler
  useEffect(() => {
    if (!isActive || !closeOnEscape) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, closeOnEscape, handleClose]);

  return { containerRef };
}

/**
 * useCardExpand - Simplified hook for managing expandable card state
 * Combines useEditMode with useState for the expanded card pattern
 *
 * @param {string} cardName - The name of this card (e.g., 'endorsements')
 * @param {string|null} expandedCard - Currently expanded card name
 * @param {Function} setExpandedCard - Function to set expanded card
 * @param {Function} [onBeforeClose] - Optional callback before closing (for cleanup)
 *
 * @returns {Object} { containerRef, isExpanded, toggle, close }
 */
export function useCardExpand(cardName, expandedCard, setExpandedCard, onBeforeClose) {
  const isExpanded = expandedCard === cardName;

  const close = useCallback(() => {
    if (onBeforeClose) onBeforeClose();
    setExpandedCard(null);
  }, [setExpandedCard, onBeforeClose]);

  const toggle = useCallback(() => {
    if (isExpanded) {
      close();
    } else {
      setExpandedCard(cardName);
    }
  }, [isExpanded, cardName, setExpandedCard, close]);

  const { containerRef } = useEditMode({
    isActive: isExpanded,
    onClose: close,
  });

  return { containerRef, isExpanded, toggle, close };
}

export default useEditMode;
