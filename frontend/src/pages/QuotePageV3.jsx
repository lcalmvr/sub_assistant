import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as Popover from '@radix-ui/react-popover';
import * as HoverCard from '@radix-ui/react-hover-card';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOptimisticMutation } from '../hooks/useOptimisticMutation';
import {
  getSubmission,
  getQuoteStructures,
  createQuoteOption,
  cloneQuoteOption,
  deleteQuoteOption,
  updateQuoteOption,
  getQuoteEndorsements,
  getQuoteSubjectivities,
  getPackageDocuments,
  generateQuoteDocument,
  generateQuotePackage,
  getQuotePreviewUrl,
  getSubmissionDocuments,
  getBindValidation,
  bindQuoteOption,
  getPolicyData,
} from '../api/client';
import StructurePicker from '../components/quote/StructurePicker';
import SummaryTabContent from '../components/quote/summary/SummaryTabContent';

export default function QuotePageV3() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();

  // Persist selected option in sessionStorage (keyed by submission)
  // This survives tab navigation better than URL params
  const [activeStructureId, setActiveStructureIdInternal] = useState(() => {
    // Read directly in initializer to avoid closure issues
    if (!submissionId) return null;
    const stored = sessionStorage.getItem(`quote-option-${submissionId}`);
    return stored || null; // IDs are UUIDs (strings), not numbers
  });

  // Sync from sessionStorage when component re-mounts (e.g., navigating back)
  useEffect(() => {
    if (!submissionId) return;
    const storedId = sessionStorage.getItem(`quote-option-${submissionId}`);
    if (storedId && storedId !== activeStructureId) {
      setActiveStructureIdInternal(storedId);
    }
  }, [submissionId]); // Only on mount / submissionId change

  // Wrapper to update both state and sessionStorage
  const setActiveStructureId = useCallback((id) => {
    setActiveStructureIdInternal(id);
    if (id && submissionId) {
      sessionStorage.setItem(`quote-option-${submissionId}`, String(id));
    }
  }, [submissionId]);
  const [activeVariationId, setActiveVariationId] = useState(null);
  const [summaryScope, setSummaryScope] = useState('quote'); // 'quote' or 'submission'
  const [showStructureDropdown, setShowStructureDropdown] = useState(false);
  const [isStructurePickerExpanded, setIsStructurePickerExpanded] = useState(false);
  const dropdownRef = useRef(null);
  const optionSelectorButtonRef = useRef(null);
  const [modalPosition, setModalPosition] = useState({ top: 0, right: 0 });

  // Calculate modal position relative to button when it opens
  useEffect(() => {
    if (isStructurePickerExpanded && optionSelectorButtonRef.current) {
      const buttonRect = optionSelectorButtonRef.current.getBoundingClientRect();
      const modalWidth = 320; // w-80 = 320px
      const viewportPadding = 16; // 16px padding from viewport edges
      
      // Position modal directly over the button, with top edges aligned
      let top = buttonRect.top;
      let right = window.innerWidth - buttonRect.right;
      
      // Ensure modal doesn't go off bottom of screen
      const estimatedModalHeight = 500; // Approximate max height
      if (top + estimatedModalHeight > window.innerHeight - viewportPadding) {
        // Adjust to fit within viewport, keeping top aligned if possible
        top = Math.max(viewportPadding, window.innerHeight - estimatedModalHeight - viewportPadding);
      }
      
      // Ensure modal doesn't go off right edge
      if (right < viewportPadding) {
        right = viewportPadding;
      }
      
      // Ensure modal doesn't go off left edge
      if (right + modalWidth > window.innerWidth - viewportPadding) {
        right = window.innerWidth - modalWidth - viewportPadding;
      }
      
      setModalPosition({ top, right });
    }
  }, [isStructurePickerExpanded]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowStructureDropdown(false);
      }
    };
    if (showStructureDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showStructureDropdown]);

  // Fetch submission
  const { data: submission } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });

  // Fetch structures with variations
  const { data: rawStructures = [], isLoading: structuresLoading } = useQuery({
    queryKey: ['structures', submissionId],
    queryFn: () => getQuoteStructures(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });

  // Fetch policy data to get sold_premium for bound quotes
  const { data: policyData } = useQuery({
    queryKey: ['policy-data', submissionId],
    queryFn: () => getPolicyData(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });

  // Augment structures with sold_premium from policy data for bound quotes
  const structures = useMemo(() => {
    const boundOption = policyData?.bound_option;
    if (!boundOption) return rawStructures;

    return rawStructures.map(s => {
      if (s.id === boundOption.id || s.is_bound) {
        return {
          ...s,
          sold_premium: boundOption.sold_premium || s.sold_premium,
          is_bound: true, // Ensure is_bound is set
        };
      }
      return s;
    });
  }, [rawStructures, policyData]);

  // Set initial active structure/variation when data loads
  useEffect(() => {
    if (structures.length && !activeStructureId) {
      // Check if sessionStorage has a valid option ID (IDs are UUID strings)
      const storedId = submissionId ? sessionStorage.getItem(`quote-option-${submissionId}`) : null;
      const storedStructure = storedId ? structures.find(s => s.id === storedId) : null;

      if (storedStructure) {
        setActiveStructureId(storedStructure.id);
        if (storedStructure.variations?.length) {
          setActiveVariationId(storedStructure.variations[0].id);
        }
      } else {
        setActiveStructureId(structures[0].id);
        if (structures[0].variations?.length) {
          setActiveVariationId(structures[0].variations[0].id);
        }
      }
    }
  }, [structures, activeStructureId, submissionId, setActiveStructureId]);

  // Get current active structure/variation
  const activeStructure = structures.find(s => s.id === activeStructureId) || structures[0];
  const variations = activeStructure?.variations || [];
  const activeVariation = variations.find(v => v.id === activeVariationId) || variations[0];

  // Fetch endorsements count for sidebar badge
  const { data: endorsementsData } = useQuery({
    queryKey: ['quote-endorsements', activeStructure?.id],
    queryFn: () => getQuoteEndorsements(activeStructure.id).then(r => r.data),
    enabled: !!activeStructure?.id,
  });
  const endorsementCount = endorsementsData?.endorsements?.length || 0;

  // Fetch subjectivities count for sidebar badge
  const { data: subjectivitiesData } = useQuery({
    queryKey: ['quote-subjectivities', activeStructure?.id],
    queryFn: () => getQuoteSubjectivities(activeStructure.id).then(r => r.data),
    enabled: !!activeStructure?.id,
  });
  const pendingSubjectivityCount = subjectivitiesData?.filter(s => s.status === 'pending' || !s.status).length || 0;

  // Bind readiness check (simplified for header display)
  const bindReadiness = useMemo(() => {
    const tower = activeStructure?.tower_json || [];
    const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
    // For bound quotes, use sold_premium
    const premium = activeStructure?.sold_premium || cmaiLayer?.premium || 0;
    const effectiveDate = activeStructure?.effective_date || submission?.effective_date;

    const blockers = [];
    const warnings = [];

    if (premium <= 0 && !activeStructure?.is_bound) blockers.push('Premium not set');
    if (!effectiveDate) blockers.push('Effective date missing');
    if (pendingSubjectivityCount > 0) warnings.push(`${pendingSubjectivityCount} pending subjectivit${pendingSubjectivityCount === 1 ? 'y' : 'ies'}`);

    return {
      isReady: blockers.length === 0 && warnings.length === 0,
      hasBlockers: blockers.length > 0,
      hasWarnings: warnings.length > 0,
      blockers,
      warnings,
    };
  }, [activeStructure, submission, pendingSubjectivityCount]);

  // Fetch document history for the entire submission (persists across options)
  const { data: documentHistory = [] } = useQuery({
    queryKey: ['submission-documents', submissionId],
    queryFn: () => getSubmissionDocuments(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });

  // Create structure mutation
  const createStructureMutation = useMutation({
    mutationFn: (data) => createQuoteOption(submissionId, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      if (response.data?.id) {
        setActiveStructureId(response.data.id);
      }
    },
  });

  // Clone structure mutation
  const cloneStructureMutation = useMutation({
    mutationFn: (structureId) => cloneQuoteOption(structureId),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      // Select the newly cloned structure
      if (response.data?.id) {
        setActiveStructureId(response.data.id);
      }
    },
  });

  // Delete structure mutation
  const deleteStructureMutation = useMutation({
    mutationFn: (structureId) => deleteQuoteOption(structureId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      // Select first remaining structure
      const remaining = structures.filter(s => s.id !== activeStructureId);
      if (remaining.length) {
        setActiveStructureId(remaining[0].id);
      }
    },
  });

  // Update tower mutation
  const updateTowerMutation = useOptimisticMutation({
    mutationFn: ({ quoteId, data }) => updateQuoteOption(quoteId, data),
    queryKey: ['structures', submissionId],
    optimisticUpdate: (old, { quoteId, data }) => old?.map(s => s.id === quoteId ? { ...s, ...data } : s),
  });

  // Generate quote document mutation
  const [generateSuccess, setGenerateSuccess] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const generateDocumentMutation = useMutation({
    mutationFn: (quoteId) => generateQuoteDocument(quoteId),
    onSuccess: (response) => {
      console.log('Generate document response:', response);
      setGenerateSuccess(true);
      setGenerateError(null);
      setShowGeneratePicker(false);
      setTimeout(() => setGenerateSuccess(false), 3000);
      // Refresh document history
      queryClient.invalidateQueries({ queryKey: ['submission-documents', submissionId] });
      // If the response includes a document URL, open it
      if (response.data?.pdf_url) {
        window.open(response.data.pdf_url, '_blank');
      } else if (response.data?.document_url) {
        window.open(response.data.document_url, '_blank');
      } else {
        console.log('No URL in response:', response.data);
      }
    },
    onError: (error) => {
      console.error('Generate document error:', error);
      setGenerateError(error.response?.data?.detail || error.message || 'Failed to generate');
      setShowGeneratePicker(true); // Keep picker open to show error
      setTimeout(() => setGenerateError(null), 5000);
    },
  });

  const handleGenerateDocument = () => {
    console.log('handleGenerateDocument called', { activeStructureId, generateDocType, selectedPackageDocs, includeSpecimen });
    if (activeStructureId) {
      if (generateDocType === 'package') {
        console.log('Calling generatePackageMutation with:', activeStructureId, selectedPackageDocs, includeSpecimen, includeEndorsements);
        generatePackageMutation.mutate({
          quoteId: activeStructureId,
          selectedDocuments: selectedPackageDocs,
          includeSpecimen: includeSpecimen,
          includeEndorsements: includeEndorsements,
        });
      } else {
        console.log('Calling generateDocumentMutation with:', activeStructureId);
        generateDocumentMutation.mutate(activeStructureId);
      }
    } else {
      console.error('No activeStructureId available');
      setGenerateError('No quote selected');
    }
  };

  // Generate package mutation
  const generatePackageMutation = useMutation({
    mutationFn: ({ quoteId, selectedDocuments, includeSpecimen, includeEndorsements }) => generateQuotePackage(quoteId, {
      package_type: 'full_package',
      selected_documents: selectedDocuments || [],
      include_specimen: includeSpecimen || false,
      include_endorsements: includeEndorsements !== false, // Default true
    }),
    onSuccess: (response) => {
      console.log('Generate package response:', response);
      setGenerateSuccess(true);
      setGenerateError(null);
      setShowGeneratePicker(false);
      setTimeout(() => setGenerateSuccess(false), 3000);
      // Refresh document history
      queryClient.invalidateQueries({ queryKey: ['submission-documents', submissionId] });
      if (response.data?.pdf_url) {
        window.open(response.data.pdf_url, '_blank');
      } else if (response.data?.document_url) {
        window.open(response.data.document_url, '_blank');
      } else {
        console.log('No URL in package response:', response.data);
      }
    },
    onError: (error) => {
      console.error('Generate package error:', error);
      setGenerateError(error.response?.data?.detail || error.message || 'Failed to generate package');
      setShowGeneratePicker(true); // Keep picker open to show error
      setTimeout(() => setGenerateError(null), 5000);
    },
  });

  // Preview document handler - generates on-the-fly without saving
  const [isPreviewLoading] = useState(false);
  const handlePreviewDocument = () => {
    if (!activeStructureId) return;
    // Open preview URL directly - generates PDF without saving
    const previewUrl = getQuotePreviewUrl(activeStructureId);
    window.open(previewUrl, '_blank');
  };

  // Generate document picker state
  const [showGeneratePicker, setShowGeneratePicker] = useState(false);
  const [generateDocType, setGenerateDocType] = useState('quote'); // 'quote' or 'package'
  const [selectedPackageDocs, setSelectedPackageDocs] = useState([]);
  const [includeSpecimen, setIncludeSpecimen] = useState(true); // Default to true like V1
  const [includeEndorsements, setIncludeEndorsements] = useState(true); // Default to true

  // Fetch package documents (claims sheets, marketing materials only - not endorsements)
  const position = activeStructure?.position || 'primary';
  const { data: packageDocsData } = useQuery({
    queryKey: ['package-documents', position],
    queryFn: () => getPackageDocuments(position).then(r => r.data),
    enabled: showGeneratePicker && generateDocType === 'package',
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Package documents come pre-grouped by document_type from the API
  const packageDocsByType = packageDocsData?.documents || {};

  // Document type display labels
  const docTypeLabels = packageDocsData?.document_types || {
    claims_sheet: 'Claims Sheets',
    marketing: 'Marketing Materials',
  };

  // Calculate package summary
  const packageSummary = useMemo(() => {
    if (generateDocType !== 'package') return null;
    const parts = ['Quote'];
    let docCount = 1; // Quote itself
    if (includeEndorsements && endorsementCount > 0) {
      parts.push(`${endorsementCount} endorsements`);
      docCount += endorsementCount;
    }
    if (includeSpecimen) {
      parts.push('Specimen');
      docCount += 1;
    }
    docCount += selectedPackageDocs.length;
    return { text: parts.join(' + '), count: docCount };
  }, [generateDocType, includeEndorsements, endorsementCount, includeSpecimen, selectedPackageDocs]);

  // Bind quote handler
  const [isBindLoading, setIsBindLoading] = useState(false);
  const handleBindQuote = async () => {
    if (!activeStructureId) return;

    setIsBindLoading(true);
    try {
      // First check validation
      const validationResponse = await getBindValidation(activeStructureId);
      const validation = validationResponse.data;

      // Check for blockers
      const blockers = validation?.blockers || [];
      if (blockers.length > 0) {
        const blockerMessages = blockers.map(b => `• ${b.message || b}`).join('\n');
        alert(`Cannot bind quote. Please resolve the following:\n\n${blockerMessages}`);
        return;
      }

      // Check for warnings and confirm
      const warnings = validation?.warnings || [];
      if (warnings.length > 0) {
        const warningMessages = warnings.map(w => `• ${w.message || w}`).join('\n');
        const proceed = window.confirm(
          `The following warnings were found:\n\n${warningMessages}\n\nDo you want to proceed with binding?`
        );
        if (!proceed) return;
      }

      // Proceed with binding
      await bindQuoteOption(activeStructureId, warnings.length > 0);

      setBindSuccess(true);
      setTimeout(() => setBindSuccess(false), 3000);

      // Refresh structures to update bound status
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });

    } catch (error) {
      console.error('Failed to bind quote:', error);
      alert(error.response?.data?.detail || 'Failed to bind quote. Please try again.');
    } finally {
      setIsBindLoading(false);
    }
  };

  // Handle structure change
  const handleStructureChange = (structureId) => {
    setActiveStructureId(structureId);
    const struct = structures.find(s => s.id === structureId);
    if (struct?.variations?.length) {
      setActiveVariationId(struct.variations[0].id);
    }
  };

  // Create new structure
  const handleCreateStructure = () => {
    createStructureMutation.mutate({
      position: 'primary',
      tower_json: [{ carrier: 'CMAI', limit: 1000000, retention: 25000, attachment: 0 }],
      quote_name: 'New Quote',
    });
  };

  // Clone current structure
  const handleCloneStructure = () => {
    if (activeStructureId) {
      cloneStructureMutation.mutate(activeStructureId);
    }
  };

  // Delete current structure
  const handleDeleteStructure = () => {
    if (activeStructureId && structures.length > 1) {
      if (window.confirm('Delete this quote structure?')) {
        deleteStructureMutation.mutate(activeStructureId);
      }
    }
  };

  if (structuresLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading quote structures...</div>
      </div>
    );
  }

  if (!structures.length) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">No Quote Structures</h2>
            <p className="text-gray-500 mb-4">Create a quote structure to get started.</p>
            <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium">
              + Create Structure
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 overflow-x-hidden">
      <main className="max-w-7xl mx-auto p-6 overflow-hidden">

        {/* Structure Picker - Slide out overlay */}
        {isStructurePickerExpanded && (
          <>
            <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setIsStructurePickerExpanded(false)} />
            <div 
              className="fixed z-50 w-80"
              style={{ 
                top: `${modalPosition.top}px`, 
                right: `${modalPosition.right}px` 
              }}
            >
              <StructurePicker
                structures={structures}
                activeStructureId={activeStructureId}
                onSelect={handleStructureChange}
                onCreate={handleCreateStructure}
                onClone={handleCloneStructure}
                onDelete={handleDeleteStructure}
                isCreating={createStructureMutation.isPending}
                isCloning={cloneStructureMutation.isPending}
                isDeleting={deleteStructureMutation.isPending}
                isExpanded={true}
                onToggle={() => setIsStructurePickerExpanded(false)}
              />
            </div>
          </>
        )}

        <div className="space-y-4">
          {/* Header Bar - Quote Selector + Action Buttons */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg p-3">
            {/* Left: Quote Selector */}
            <button
              ref={optionSelectorButtonRef}
              onClick={() => setIsStructurePickerExpanded(true)}
              className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:border-purple-300 transition-colors text-sm min-w-[200px]"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                <span className="font-semibold text-gray-800">{activeStructure?.quote_name || 'Select Structure'}</span>
                {activeStructure?.position === 'excess' && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">XS</span>
                )}
                {/* Quote Status Badge */}
                {(() => {
                  const statusConfig = {
                    draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-600' },
                    indication: { label: 'Indication', bg: 'bg-amber-100', text: 'text-amber-700' },
                    quoted: { label: 'Quoted', bg: 'bg-purple-100', text: 'text-purple-700' },
                    bound: { label: 'Bound', bg: 'bg-green-100', text: 'text-green-700' },
                  };
                  const status = activeStructure?.is_bound ? statusConfig.bound : (statusConfig[activeStructure?.status] || statusConfig.draft);
                  return (
                    <span className={`text-[10px] ${status.bg} ${status.text} px-1.5 py-0.5 rounded font-medium`}>
                      {status.label}
                    </span>
                  );
                })()}
              </div>
              <span className="text-xs text-gray-400">{structures.length} options</span>
            </button>

            {/* Scope Toggle: Quote vs Submission */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setSummaryScope('quote')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  summaryScope === 'quote'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Quote
              </button>
              <button
                onClick={() => setSummaryScope('submission')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  summaryScope === 'submission'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Submission
              </button>
            </div>

            {/* Center: Bind Readiness Indicator */}
            <HoverCard.Root openDelay={100} closeDelay={100}>
              <HoverCard.Trigger asChild>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-default ${
                  bindReadiness.isReady
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : bindReadiness.hasBlockers
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {bindReadiness.isReady ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Bind Ready
                    </>
                  ) : bindReadiness.hasBlockers ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {bindReadiness.blockers.length} Blocker{bindReadiness.blockers.length > 1 ? 's' : ''}
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {bindReadiness.warnings.length} Warning{bindReadiness.warnings.length > 1 ? 's' : ''}
                    </>
                  )}
                </div>
              </HoverCard.Trigger>
              {!bindReadiness.isReady && (
                <HoverCard.Portal>
                  <HoverCard.Content className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3" sideOffset={4}>
                    <div className="space-y-2">
                      {bindReadiness.blockers.map((item, idx) => (
                        <div key={`b-${idx}`} className="flex items-center gap-2 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                          <span className="text-red-700">{item}</span>
                        </div>
                      ))}
                      {bindReadiness.warnings.map((item, idx) => (
                        <div key={`w-${idx}`} className="flex items-center gap-2 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                          <span className="text-amber-700">{item}</span>
                        </div>
                      ))}
                    </div>
                    <HoverCard.Arrow className="fill-white" />
                  </HoverCard.Content>
                </HoverCard.Portal>
              )}
            </HoverCard.Root>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviewDocument}
                disabled={isPreviewLoading || !activeStructureId}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Preview
              </button>
              <Popover.Root open={showGeneratePicker} onOpenChange={setShowGeneratePicker}>
                <Popover.Trigger asChild>
                  <button
                    disabled={generateDocumentMutation.isPending || generatePackageMutation.isPending || !activeStructureId}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content className={`z-[9999] rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden ${generateDocType === 'package' ? 'w-[420px]' : 'w-80'}`} sideOffset={8} align="end">
                    {/* Header with gradient */}
                    <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="font-semibold text-white text-sm">Generate Document</h3>
                      </div>
                    </div>
                    <div className="p-5 space-y-5">
                      {/* Document Type Selection */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Document Type</div>
                        <div className="flex items-center gap-4 p-2 bg-slate-50 rounded-lg">
                          <label className="flex-1 flex items-center gap-2.5 cursor-pointer group">
                            <input
                              type="radio"
                              name="docTypeHeader"
                              value="quote"
                              checked={generateDocType === 'quote'}
                              onChange={() => setGenerateDocType('quote')}
                              className="w-4 h-4 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                            />
                            <span className={`text-sm font-medium transition-colors ${generateDocType === 'quote' ? 'text-purple-700' : 'text-gray-600 group-hover:text-gray-800'}`}>
                              Quote Only
                            </span>
                          </label>
                          <label className="flex-1 flex items-center gap-2.5 cursor-pointer group">
                            <input
                              type="radio"
                              name="docTypeHeader"
                              value="package"
                              checked={generateDocType === 'package'}
                              onChange={() => setGenerateDocType('package')}
                              className="w-4 h-4 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                            />
                            <span className={`text-sm font-medium transition-colors ${generateDocType === 'package' ? 'text-purple-700' : 'text-gray-600 group-hover:text-gray-800'}`}>
                              Full Package
                            </span>
                          </label>
                        </div>
                      </div>
                      {/* Document selector for Full Package */}
                      {generateDocType === 'package' && (
                        <div className="border border-gray-200 rounded-lg bg-slate-50/50 overflow-hidden">
                          <div className="max-h-[360px] overflow-y-auto p-4 space-y-4">
                            {/* Quote Specimens section */}
                            <div className="space-y-3 pb-3 border-b border-gray-200">
                              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Quote Specimens</div>
                              <div className="space-y-2.5">
                                <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-md hover:bg-white transition-colors">
                                  <input type="checkbox" checked={includeEndorsements} onChange={(e) => setIncludeEndorsements(e.target.checked)} className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0" />
                                  <div className="flex-1">
                                    <span className="text-sm font-medium text-gray-800 block">Endorsement Package</span>
                                    {endorsementCount > 0 && <span className="text-xs text-gray-500 mt-0.5 block">{endorsementCount} {endorsementCount === 1 ? 'endorsement' : 'endorsements'} included</span>}
                                  </div>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-md hover:bg-white transition-colors">
                                  <input type="checkbox" checked={includeSpecimen} onChange={(e) => setIncludeSpecimen(e.target.checked)} className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0" />
                                  <span className="text-sm font-medium text-gray-800">Policy Specimen</span>
                                </label>
                              </div>
                            </div>
                            {/* Documents grouped by type */}
                            {Object.entries(packageDocsByType).length > 0 ? (
                              Object.entries(packageDocsByType).map(([docType, docs], idx) => (
                                <div key={docType} className={idx > 0 ? 'pt-3 border-t border-gray-200' : ''}>
                                  <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2.5">{docTypeLabels[docType] || docType.replace(/_/g, ' ')}</div>
                                  <div className="space-y-1.5">
                                    {docs.map((doc) => (
                                      <label key={doc.id} className="flex items-start gap-3 cursor-pointer group p-2 rounded-md hover:bg-white transition-colors">
                                        <input type="checkbox" checked={selectedPackageDocs.includes(doc.id)} onChange={(e) => { if (e.target.checked) { setSelectedPackageDocs([...selectedPackageDocs, doc.id]); } else { setSelectedPackageDocs(selectedPackageDocs.filter(id => id !== doc.id)); } }} className="w-4 h-4 text-purple-600 rounded border-gray-300 mt-0.5 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0" />
                                        <div className="flex-1 min-w-0">
                                          {doc.code && <span className="text-xs font-mono text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded mr-1.5">{doc.code}</span>}
                                          <span className="text-sm text-gray-700 group-hover:text-gray-900">{doc.title}</span>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-gray-400 text-center py-4">No additional documents available</div>
                            )}
                            {/* Summary line */}
                            {packageSummary && (
                              <div className="pt-3 mt-3 border-t-2 border-purple-200 bg-purple-50/50 rounded-md p-3 -mx-1">
                                <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">Package Summary</div>
                                <div className="text-sm text-gray-700 font-medium">{packageSummary.text}</div>
                                <div className="text-xs text-gray-500 mt-1">Total: {packageSummary.count} {packageSummary.count === 1 ? 'document' : 'documents'}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Status messages */}
                      {(generateSuccess || generateError) && (
                        <div className={`p-3 rounded-lg text-sm text-center ${generateSuccess ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                          {generateSuccess && <div className="flex items-center justify-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Quote generated successfully!</div>}
                          {generateError && generateError}
                        </div>
                      )}
                    </div>
                    {/* Button at bottom */}
                    <div className="px-5 pb-5">
                      <button
                        onClick={() => { setGenerateError(null); handleGenerateDocument(); }}
                        disabled={generateDocumentMutation.isPending || generatePackageMutation.isPending}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white text-sm font-semibold hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        {(generateDocumentMutation.isPending || generatePackageMutation.isPending) ? (
                          <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating...</>
                        ) : generateDocType === 'package' ? (
                          <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>Generate Package ({packageSummary?.count || 1} docs)</>
                        ) : 'Generate Quote'}
                      </button>
                    </div>
                    <Popover.Arrow className="fill-white" />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              <button
                onClick={handleBindQuote}
                disabled={isBindLoading || !activeStructureId}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Bind
              </button>
            </div>
          </div>

          {/* Main Content - Full Width */}
          <div className="w-full">
            <SummaryTabContent
              structure={activeStructure}
              variation={activeVariation}
              submission={submission}
              structureId={activeStructureId}
              structures={structures}
              documentHistory={documentHistory}
              summaryScope={summaryScope}
              selectedQuoteId={activeStructureId}
              onSelect={setActiveStructureId}
              onUpdateOption={(quoteId, data) => updateTowerMutation.mutate({ quoteId, data })}
            />
          </div>
        </div>
      </main>

    </div>
  );
}
