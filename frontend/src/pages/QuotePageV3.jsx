import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as Popover from '@radix-ui/react-popover';
import * as HoverCard from '@radix-ui/react-hover-card';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOptimisticMutation, useSimpleMutation } from '../hooks/useOptimisticMutation';
import {
  getSubmission,
  getQuoteStructures,
  createQuoteOption,
  cloneQuoteOption,
  deleteQuoteOption,
  updateQuoteOption,
  updateVariation,
  getQuoteEndorsements,
  getQuoteSubjectivities,
  getSubmissionEndorsements,
  getSubmissionSubjectivities,
  getDocumentLibraryEntries,
  getPackageDocuments,
  getSubjectivityTemplates,
  linkEndorsementToQuote,
  unlinkEndorsementFromQuote,
  linkSubjectivityToQuote,
  unlinkSubjectivityFromQuote,
  createSubjectivity,
  updateSubjectivity,
  createDocumentLibraryEntry,
  updateDocumentLibraryEntry,
  generateQuoteDocument,
  generateQuotePackage,
  getQuotePreviewUrl,
  getSubmissionDocuments,
  getBindValidation,
  bindQuoteOption,
  getPolicyData,
} from '../api/client';
import { SUBLIMIT_COVERAGES } from '../components/CoverageEditor';
import {
  formatCurrency,
  formatDate,
  formatNumberWithCommas,
  parseQuoteIds,
  calculateAttachment,
  getStructurePosition,
  generateOptionName,
  normalizeRetroSchedule,
  formatRetroSummary,
  formatComparisonText,
} from '../utils/quoteUtils';
import EndorsementsCard from '../components/quote/summary/EndorsementsCard';
import SubjectivitiesCard from '../components/quote/summary/SubjectivitiesCard';
import NotesCard from '../components/quote/summary/NotesCard';
import TowerCard from '../components/quote/summary/TowerCard';
import StructurePicker from '../components/quote/StructurePicker';
import TermsCardContent from '../components/quote/summary/TermsCardContent';
import RetroCardContent from '../components/quote/summary/RetroCardContent';
import CommissionCardContent from '../components/quote/summary/CommissionCardContent';
import CoveragesCardContent from '../components/quote/summary/CoveragesCardContent';

// ============================================================================
// SUMMARY TAB CONTENT
// ============================================================================

function SummaryTabContent({ structure, variation, submission, structureId, structures, documentHistory = [], summaryScope = 'quote', selectedQuoteId, onSelect, onUpdateOption }) {
  const queryClient = useQueryClient();
  const [showAllSublimits, setShowAllSublimits] = useState(false);
  const [excessCoverageFilter, setExcessCoverageFilter] = useState('all'); // 'dropdown' | 'all' | 'nonfollow' for excess quotes
  const [showMissingSuggestions, setShowMissingSuggestions] = useState(false); // Single toggle for all missing suggestions
  const [showOnlyOurLayer, setShowOnlyOurLayer] = useState(false);
  const [showQuoteOptions, setShowQuoteOptions] = useState(true); // Collapsible quote options in submission mode
  // Expandable card state for C1/C2 pattern
  const [expandedCard, setExpandedCard] = useState(null); // 'subjectivities' | 'endorsements' | 'terms' | 'premium' | 'retro' | 'commission' | null

  // Premium editing state for Quote Options table (submission mode)
  const [isEditingPremiums, setIsEditingPremiums] = useState(false);
  const [premiumDraft, setPremiumDraft] = useState({});
  const quoteOptionsRef = useRef(null);
  const excessCoverageSaveRef = useRef(null);  // Ref to trigger save from Done button
  const [cachedIsExcess, setCachedIsExcess] = useState(null);  // Cache excess status while editing to prevent flicker
  const premiumInputRefs = useRef({});

  // Subjectivity library picker state (controls query enablement)
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);

  // Applies-to popover state for various cards
  const [termAppliesToPopoverId, setTermAppliesToPopoverId] = useState(null);
  const [retroAppliesToPopoverId, setRetroAppliesToPopoverId] = useState(null);
  const [commissionAppliesToPopoverId, setCommissionAppliesToPopoverId] = useState(null);
  // State for editing/adding term configurations
  const [editingTermKey, setEditingTermKey] = useState(null);
  const [editingTermEffective, setEditingTermEffective] = useState('');
  const [editingTermExpiration, setEditingTermExpiration] = useState('');
  const [editingTermDatesTbd, setEditingTermDatesTbd] = useState(false);
  const [isAddingTerm, setIsAddingTerm] = useState(false);
  const [newTermEffective, setNewTermEffective] = useState('');
  const [newTermExpiration, setNewTermExpiration] = useState('');
  const [newTermDatesTbd, setNewTermDatesTbd] = useState(false);
  const [newTermSelectedQuotes, setNewTermSelectedQuotes] = useState([]);
  // State for editing/adding retro configurations
  const [editingRetroKey, setEditingRetroKey] = useState(null);
  const [isAddingRetro, setIsAddingRetro] = useState(false);
  const [inlineEditRetroSchedule, setInlineEditRetroSchedule] = useState([]);
  const [inlineNewRetroSchedule, setInlineNewRetroSchedule] = useState([]);
  const [newRetroSelectedQuotes, setNewRetroSelectedQuotes] = useState([]);
  // State for editing/adding commission configurations (no Net Out in submission mode - premiums not available)
  const [editingCommissionKey, setEditingCommissionKey] = useState(null);
  const [editingCommissionRate, setEditingCommissionRate] = useState('');
  const [isAddingCommission, setIsAddingCommission] = useState(false);
  const [newCommissionRate, setNewCommissionRate] = useState('');
  const [newCommissionSelectedQuotes, setNewCommissionSelectedQuotes] = useState([]);
  const [showEndorsementLibraryPicker, setShowEndorsementLibraryPicker] = useState(false); // Enables library query

  // Retro card ref
  const retroCardRef = useRef(null);

  // Terms card ref
  const termsCardRef = useRef(null);

  // Commission card ref
  const commissionCardRef = useRef(null);

  // Tower card ref
  const towerCardRef = useRef(null);

  // Coverages card ref
  const coveragesCardRef = useRef(null);

  // Click outside to close expanded retro card
  useEffect(() => {
    if (expandedCard !== 'retro') return;

    const handleClickOutside = (e) => {
      if (retroCardRef.current && !retroCardRef.current.contains(e.target)) {
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;

        // Trigger blur on active element to save any pending edit
        if (document.activeElement && retroCardRef.current.contains(document.activeElement)) {
          document.activeElement.blur();
        }

        setExpandedCard(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCard]);

  // Click outside to close expanded terms card
  useEffect(() => {
    if (expandedCard !== 'terms') return;

    const handleClickOutside = (e) => {
      if (termsCardRef.current && !termsCardRef.current.contains(e.target)) {
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;

        // Trigger blur on active element to save any pending edit
        if (document.activeElement && termsCardRef.current.contains(document.activeElement)) {
          document.activeElement.blur();
        }

        setExpandedCard(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCard]);

  // Click outside to close expanded commission card
  useEffect(() => {
    if (expandedCard !== 'commission') return;

    const handleClickOutside = (e) => {
      if (commissionCardRef.current && !commissionCardRef.current.contains(e.target)) {
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;

        // Trigger blur on active element to save any pending edit
        if (document.activeElement && commissionCardRef.current.contains(document.activeElement)) {
          document.activeElement.blur();
        }

        setExpandedCard(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCard]);

  // Click outside to close expanded tower card
  useEffect(() => {
    if (expandedCard !== 'tower') return;

    const handleClickOutside = (e) => {
      if (towerCardRef.current && !towerCardRef.current.contains(e.target)) {
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;

        // Trigger blur on active element to save any pending edit
        if (document.activeElement && towerCardRef.current.contains(document.activeElement)) {
          document.activeElement.blur();
        }

        setExpandedCard(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCard]);

  // Click outside to close expanded coverages card
  // NOTE: For excess quotes, we call the save ref before closing to preserve draft data
  useEffect(() => {
    if (expandedCard !== 'coverages') return;

    const handleClickOutside = (e) => {
      if (coveragesCardRef.current && !coveragesCardRef.current.contains(e.target)) {
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;

        // Trigger blur on active element to save any pending edit
        if (document.activeElement && coveragesCardRef.current.contains(document.activeElement)) {
          document.activeElement.blur();
        }

        // For excess quotes, trigger save before closing (the save callback will close the card)
        if (excessCoverageSaveRef.current) {
          excessCoverageSaveRef.current();
          // Don't call setExpandedCard(null) here - the onSave callback will do it
          return;
        }

        // For primary quotes (no save ref), just close
        setExpandedCard(null);
        setCachedIsExcess(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCard]);

  // Escape key to close expanded retro card
  useEffect(() => {
    if (expandedCard !== 'retro') return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Trigger blur on active element to save any pending edit
        if (document.activeElement && retroCardRef.current?.contains(document.activeElement)) {
          document.activeElement.blur();
        }
        setExpandedCard(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedCard]);

  const submissionId = submission?.id;

  const quoteType = getStructurePosition(structure) === 'excess' ? 'excess' : 'primary';
  const peerLabel = quoteType === 'excess' ? 'Excess' : 'Primary';
  const peerIds = useMemo(() => (
    (structures || [])
      .filter(struct => getStructurePosition(struct) === quoteType && String(struct.id) !== String(structureId))
      .map(struct => String(struct.id))
  ), [structures, quoteType, structureId]);

  // All options for "Applies To" popover
  const allOptions = useMemo(() => (
    (structures || []).map(s => ({
      id: String(s.id),
      name: s.quote_name || generateOptionName(s),
      position: getStructurePosition(s),
    }))
  ), [structures]);
  const allOptionIds = useMemo(() => allOptions.map(o => o.id), [allOptions]);
  const allPrimaryIds = useMemo(() => allOptions.filter(o => o.position !== 'excess').map(o => o.id), [allOptions]);
  const allExcessIds = useMemo(() => allOptions.filter(o => o.position === 'excess').map(o => o.id), [allOptions]);

  // Premium editing helpers for Quote Options table
  const parseNumber = (str) => {
    const cleaned = String(str).replace(/[^0-9.-]/g, '');
    return cleaned === '' ? 0 : Number(cleaned);
  };

  const enterPremiumEditMode = (focusId = null) => {
    const initialDraft = {};
    (structures || []).forEach(struct => {
      const tower = struct.tower_json || [];
      const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
      initialDraft[struct.id] = cmaiLayer?.premium || 0;
    });
    setPremiumDraft(initialDraft);
    setIsEditingPremiums(true);
    // Focus specified input after state update
    if (focusId) {
      setTimeout(() => {
        const input = premiumInputRefs.current[focusId];
        if (input) {
          input.focus();
          input.select();
        }
      }, 0);
    }
  };

  const savePremiumsAndExit = () => {
    (structures || []).forEach(struct => {
      const newPremium = premiumDraft[struct.id];
      if (newPremium === undefined) return;

      const tower = struct.tower_json || [];
      const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
      const currentPremium = cmaiLayer?.premium || 0;

      if (newPremium !== currentPremium) {
        const newTower = [...tower];
        const cmaiIdx = newTower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
        if (cmaiIdx >= 0) {
          newTower[cmaiIdx] = { ...newTower[cmaiIdx], premium: newPremium };
          if (onUpdateOption) {
            onUpdateOption(struct.id, { tower_json: newTower });
          }
        }
      }
    });

    setIsEditingPremiums(false);
    setPremiumDraft({});
  };

  const handlePremiumKeyDown = (e, currentId) => {
    const optionIds = allOptions.map(o => o.id);
    const currentIdx = optionIds.indexOf(currentId);

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevId = optionIds[currentIdx - 1];
      if (prevId && premiumInputRefs.current[prevId]) {
        premiumInputRefs.current[prevId].focus();
        premiumInputRefs.current[prevId].select();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const nextId = optionIds[currentIdx + 1];
      if (nextId && premiumInputRefs.current[nextId]) {
        premiumInputRefs.current[nextId].focus();
        premiumInputRefs.current[nextId].select();
      } else if (e.key === 'Enter') {
        savePremiumsAndExit();
      }
    } else if (e.key === 'Escape') {
      setIsEditingPremiums(false);
      setPremiumDraft({});
    }
  };

  const updatePremiumDraft = (structId, value) => {
    setPremiumDraft(prev => ({ ...prev, [structId]: value }));
  };

  // Click outside to save premium edits
  useEffect(() => {
    if (!isEditingPremiums) return;

    const handleClickOutside = (e) => {
      if (quoteOptionsRef.current && !quoteOptionsRef.current.contains(e.target)) {
        savePremiumsAndExit();
      }
    };

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsEditingPremiums(false);
        setPremiumDraft({});
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isEditingPremiums, premiumDraft, structures, onUpdateOption]);

  // Calculate which peers have matching retro config
  const currentRetroNormalized = normalizeRetroSchedule(structure?.retro_schedule);
  const retroMatchingPeerIds = useMemo(() => {
    return (structures || [])
      .filter(s => String(s.id) !== String(structureId))
      .filter(s => normalizeRetroSchedule(s.retro_schedule) === currentRetroNormalized)
      .map(s => String(s.id));
  }, [structures, structureId, currentRetroNormalized]);

  // Submission mode: compute variations across all quotes
  const allQuoteTerms = useMemo(() => {
    if (!structures || !allOptions) return [];
    return allOptions.map(opt => {
      const s = structures.find(st => String(st.id) === String(opt.id));
      const v = s?.variations?.[0];
      const datesTbd = v?.dates_tbd || false;
      const effDate = v?.effective_date_override || s?.effective_date || submission?.effective_date;
      const expDate = v?.expiration_date_override || s?.expiration_date || submission?.expiration_date;
      return {
        quoteId: opt.id,
        quoteName: opt.name,
        datesTbd,
        effDate,
        expDate,
        key: datesTbd ? 'TBD' : `${effDate || ''}-${expDate || ''}`,
      };
    });
  }, [structures, allOptions, submission]);

  const allQuoteRetros = useMemo(() => {
    if (!structures || !allOptions) return [];
    return allOptions.map(opt => {
      const s = structures.find(st => String(st.id) === String(opt.id));
      return {
        quoteId: opt.id,
        quoteName: opt.name,
        retroSchedule: s?.retro_schedule || [],
        retroNotes: s?.retro_notes || '',
        key: normalizeRetroSchedule(s?.retro_schedule),
      };
    });
  }, [structures, allOptions]);

  const allQuoteCommissions = useMemo(() => {
    if (!structures || !allOptions) return [];
    return allOptions.map(opt => {
      const s = structures.find(st => String(st.id) === String(opt.id));
      const v = s?.variations?.[0];
      // Match quote mode: variation.commission_override ?? 15
      const rate = v?.commission_override ?? 15;
      return {
        quoteId: opt.id,
        quoteName: opt.name,
        commissionRate: rate,
        key: String(rate),
      };
    });
  }, [structures, allOptions]);

  // Grouped variations for KPI cards (for showing "value (X/Y)" badges)
  const termVariationGroups = useMemo(() => {
    const groups = {};
    allQuoteTerms.forEach(t => {
      if (!groups[t.key]) {
        groups[t.key] = {
          key: t.key,
          label: t.datesTbd ? 'TBD' : `${formatDate(t.effDate)} - ${formatDate(t.expDate)}`,
          count: 0,
          datesTbd: t.datesTbd,
          effDate: t.effDate,
          expDate: t.expDate,
          quoteIds: [],
        };
      }
      groups[t.key].count++;
      groups[t.key].quoteIds.push(String(t.quoteId));
    });
    // Sort by count descending (most common first)
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [allQuoteTerms]);

  const retroVariationGroups = useMemo(() => {
    const groups = {};
    allQuoteRetros.forEach(r => {
      if (!groups[r.key]) {
        groups[r.key] = {
          key: r.key,
          label: formatRetroSummary(r.retroSchedule),
          schedule: r.retroSchedule, // Keep raw schedule for detailed rendering
          count: 0,
          quoteIds: [],
        };
      }
      groups[r.key].count++;
      groups[r.key].quoteIds.push(String(r.quoteId));
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [allQuoteRetros]);

  const commissionVariationGroups = useMemo(() => {
    const groups = {};
    allQuoteCommissions.forEach(c => {
      if (!groups[c.key]) {
        groups[c.key] = {
          key: c.key,
          label: `${c.commissionRate}%`,
          count: 0,
          commissionRate: c.commissionRate,
          quoteIds: [],
        };
      }
      groups[c.key].count++;
      groups[c.key].quoteIds.push(String(c.quoteId));
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [allQuoteCommissions]);

  // State for retro "Apply to" popover
  const [showRetroApplyPopover, setShowRetroApplyPopover] = useState(false);

  // Fetch endorsements
  const { data: endorsementsData } = useQuery({
    queryKey: ['quote-endorsements', structureId],
    queryFn: () => getQuoteEndorsements(structureId).then(r => r.data),
    enabled: !!structureId,
  });
  const { data: submissionEndorsementsData } = useQuery({
    queryKey: ['submissionEndorsements', submissionId],
    queryFn: () => getSubmissionEndorsements(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });
  // Sort endorsements: required first, automatic next, manual last
  const endorsements = [...(endorsementsData?.endorsements || [])].sort((a, b) => {
    const aRequired = a.category === 'required' || a.is_required ? 2 : 0;
    const bRequired = b.category === 'required' || b.is_required ? 2 : 0;
    const aAuto = a.is_auto || a.auto_attach_rules || a.attachment_type === 'auto' ? 1 : 0;
    const bAuto = b.is_auto || b.auto_attach_rules || b.attachment_type === 'auto' ? 1 : 0;
    return (bRequired + bAuto) - (aRequired + aAuto);
  });

  // Fetch subjectivities
  const { data: subjectivitiesData } = useQuery({
    queryKey: ['quote-subjectivities', structureId],
    queryFn: () => getQuoteSubjectivities(structureId).then(r => r.data),
    enabled: !!structureId,
  });
  const { data: submissionSubjectivitiesData = [] } = useQuery({
    queryKey: ['submissionSubjectivities', submissionId],
    queryFn: () => getSubmissionSubjectivities(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });
  // Sort required subjectivities to top
  const subjectivities = [...(subjectivitiesData || [])].sort((a, b) => {
    const aRequired = a.is_required || a.category === 'required' ? 1 : 0;
    const bRequired = b.is_required || b.category === 'required' ? 1 : 0;
    return bRequired - aRequired;
  });

  // Create lookup map for quote_ids from submission-level data
  // Filter to only include quote IDs that still exist (exclude deleted quotes)
  const existingQuoteIdSet = useMemo(() => new Set(allOptionIds), [allOptionIds]);
  const subjectivityQuoteIdsMap = useMemo(() => {
    const map = new Map();
    (submissionSubjectivitiesData || []).forEach(subj => {
      const id = String(subj.id || '');
      if (id) {
        const allIds = parseQuoteIds(subj.quote_ids);
        // Filter to only include IDs that exist in current structures
        const existingIds = allIds.filter(qid => existingQuoteIdSet.has(String(qid)));
        map.set(id, existingIds);
      }
    });
    return map;
  }, [submissionSubjectivitiesData, existingQuoteIdSet]);

  const currentSubjectivityItems = useMemo(() => (
    subjectivities.map(subj => {
      const id = String(subj.subjectivity_id || subj.template_id || subj.id || '');
      const rawId = subj.id;
      // Look up quote_ids from submission-level data using the raw id
      const quoteIds = subjectivityQuoteIdsMap.get(String(rawId)) || [];
      return {
        id,
        rawId,
        label: subj.subjectivity_text || subj.text || subj.title || 'Subjectivity',
        status: subj.status,
        quoteIds,
      };
    }).filter(item => item.id)
  ), [subjectivities, subjectivityQuoteIdsMap]);

  const endorsementQuoteIdsMap = useMemo(() => {
    const map = new Map();
    const submissionEndorsements = submissionEndorsementsData?.endorsements || [];
    submissionEndorsements.forEach(endt => {
      const id = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
      if (id) {
        const allIds = parseQuoteIds(endt.quote_ids);
        const existingIds = allIds.filter(qid => existingQuoteIdSet.has(String(qid)));
        map.set(id, existingIds);
      }
    });
    return map;
  }, [submissionEndorsementsData, existingQuoteIdSet]);

  // Maps for Quote Options summary table (submission mode)
  const subjectivitiesByQuote = useMemo(() => {
    const map = new Map();
    (submissionSubjectivitiesData || []).forEach(subj => {
      const label = subj.text || subj.subjectivity_text || subj.title || 'Subjectivity';
      const quoteIds = parseQuoteIds(subj.quote_ids);
      quoteIds.forEach(id => {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push({ id: subj.id, label, status: subj.status });
      });
    });
    return map;
  }, [submissionSubjectivitiesData]);

  const endorsementsByQuote = useMemo(() => {
    const map = new Map();
    const endorsementList = submissionEndorsementsData?.endorsements || [];
    endorsementList.forEach(endt => {
      const label = endt.title || endt.code || 'Endorsement';
      const quoteIds = parseQuoteIds(endt.quote_ids);
      quoteIds.forEach(id => {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push({ id: endt.endorsement_id, label, code: endt.code });
      });
    });
    return map;
  }, [submissionEndorsementsData]);

  // Compute position-based comparison stats for ALL quotes (for submission mode table)
  const positionComparisonStats = useMemo(() => {
    const stats = new Map();
    if (!structures?.length) return stats;

    // Group structures by position
    const primaryIds = structures.filter(s => getStructurePosition(s) !== 'excess').map(s => String(s.id));
    const excessIds = structures.filter(s => getStructurePosition(s) === 'excess').map(s => String(s.id));

    // Helper to compute union of items across sibling IDs (excluding self)
    const computeSiblingUnion = (selfId, siblingIds, itemsByQuote) => {
      const union = new Map(); // id -> label
      siblingIds.forEach(sibId => {
        if (sibId === selfId) return;
        const items = itemsByQuote.get(sibId) || [];
        items.forEach(item => {
          if (!union.has(item.id)) {
            union.set(item.id, item.label);
          }
        });
      });
      return union;
    };

    structures.forEach(struct => {
      const structId = String(struct.id);
      const isExcess = getStructurePosition(struct) === 'excess';
      const siblingIds = isExcess ? excessIds : primaryIds;

      // Get this structure's items
      const mySubjectivities = subjectivitiesByQuote.get(structId) || [];
      const myEndorsements = endorsementsByQuote.get(structId) || [];
      const mySubjIds = new Set(mySubjectivities.map(s => s.id));
      const myEndtIds = new Set(myEndorsements.map(e => e.id));

      // Compute sibling unions
      const subjSiblingUnion = computeSiblingUnion(structId, siblingIds, subjectivitiesByQuote);
      const endtSiblingUnion = computeSiblingUnion(structId, siblingIds, endorsementsByQuote);

      // Missing = in sibling union but not on this option
      const missingSubjs = [];
      subjSiblingUnion.forEach((label, id) => {
        if (!mySubjIds.has(id)) {
          missingSubjs.push({ id, label });
        }
      });

      const missingEndts = [];
      endtSiblingUnion.forEach((label, id) => {
        if (!myEndtIds.has(id)) {
          missingEndts.push({ id, label });
        }
      });

      // Extra = on this option but not in sibling union
      const extraSubjs = mySubjectivities.filter(s => !subjSiblingUnion.has(s.id));
      const extraEndts = myEndorsements.filter(e => !endtSiblingUnion.has(e.id));

      stats.set(structId, {
        subjectivities: {
          total: mySubjectivities.length,
          missing: missingSubjs,
          extra: extraSubjs,
        },
        endorsements: {
          total: myEndorsements.length,
          missing: missingEndts,
          extra: extraEndts,
        },
      });
    });

    return stats;
  }, [structures, subjectivitiesByQuote, endorsementsByQuote]);

  const currentEndorsementItems = useMemo(() => (
    endorsements.map(endt => {
      const id = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
      const quoteIds = endorsementQuoteIdsMap.get(id) || [];
      return {
        id,
        rawId: endt.endorsement_id || endt.document_library_id || endt.id,
        label: endt.title || endt.name || endt.code || 'Endorsement',
        category: endt.category,
        isRequired: endt.category === 'required' || endt.is_required,
        isAuto: endt.is_auto || endt.auto_attach_rules || endt.attachment_type === 'auto',
        isManuscript: endt.category === 'manuscript',
        quoteIds,
      };
    }).filter(item => item.id)
  ), [endorsements, endorsementQuoteIdsMap]);

  // Type icon helper for endorsements
  const getEndorsementIcon = (item) => {
    if (item.isRequired) return <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>;
    if (item.isAuto) return <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
    return <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
  };

  // Compute peer union - all items that exist on ANY same-position sibling
  const peerSubjectivityUnion = useMemo(() => {
    const union = new Map(); // id -> label
    (submissionSubjectivitiesData || []).forEach(subj => {
      const id = String(subj.id || '');
      if (!id) return;
      const label = subj.text || subj.subjectivity_text || subj.title || 'Subjectivity';
      const quoteIds = parseQuoteIds(subj.quote_ids).map(val => String(val));
      // Check if this subjectivity is on any peer (same-position sibling)
      const isOnPeer = peerIds.some(peerId => quoteIds.includes(peerId));
      if (isOnPeer) {
        union.set(id, label);
      }
    });
    return union;
  }, [submissionSubjectivitiesData, peerIds]);

  const peerEndorsementUnion = useMemo(() => {
    const union = new Map(); // id -> label
    const submissionEndorsements = submissionEndorsementsData?.endorsements || [];
    submissionEndorsements.forEach(endt => {
      const id = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
      if (!id) return;
      const label = endt.title || endt.name || endt.code || 'Endorsement';
      const quoteIds = parseQuoteIds(endt.quote_ids).map(val => String(val));
      // Check if this endorsement is on any peer (same-position sibling)
      const isOnPeer = peerIds.some(peerId => quoteIds.includes(peerId));
      if (isOnPeer) {
        union.set(id, label);
      }
    });
    return union;
  }, [submissionEndorsementsData, peerIds]);

  const currentSubjectivityIdSet = useMemo(() => (
    new Set(currentSubjectivityItems.map(item => item.id))
  ), [currentSubjectivityItems]);

  const currentEndorsementIdSet = useMemo(() => (
    new Set(currentEndorsementItems.map(item => item.id))
  ), [currentEndorsementItems]);

  // Missing = in peer union but not on this option
  const missingSubjectivities = useMemo(() => {
    const missing = [];
    peerSubjectivityUnion.forEach((label, id) => {
      if (!currentSubjectivityIdSet.has(id)) {
        missing.push({ id, label });
      }
    });
    return missing;
  }, [peerSubjectivityUnion, currentSubjectivityIdSet]);

  const missingEndorsements = useMemo(() => {
    const missing = [];
    peerEndorsementUnion.forEach((label, id) => {
      if (!currentEndorsementIdSet.has(id)) {
        missing.push({ id, label });
      }
    });
    return missing;
  }, [peerEndorsementUnion, currentEndorsementIdSet]);

  // Extra = on this option but not in peer union (unique to this option)
  const uniqueSubjectivities = useMemo(() => (
    currentSubjectivityItems.filter(item => !peerSubjectivityUnion.has(item.id))
  ), [currentSubjectivityItems, peerSubjectivityUnion]);

  const uniqueEndorsements = useMemo(() => (
    currentEndorsementItems.filter(item => !peerEndorsementUnion.has(item.id))
  ), [currentEndorsementItems, peerEndorsementUnion]);

  // Aligned = on this option AND in peer union
  const alignedSubjectivities = useMemo(() => (
    currentSubjectivityItems.filter(item => peerSubjectivityUnion.has(item.id))
  ), [currentSubjectivityItems, peerSubjectivityUnion]);

  const alignedEndorsements = useMemo(() => (
    currentEndorsementItems.filter(item => peerEndorsementUnion.has(item.id))
  ), [currentEndorsementItems, peerEndorsementUnion]);

  // All submission endorsements for submission scope view
  // Filter out orphaned items (no quotes linked) since they serve no purpose
  const allSubmissionEndorsements = useMemo(() => {
    const endorsements = submissionEndorsementsData?.endorsements || [];
    return endorsements.map(endt => {
      const id = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
      const allIds = parseQuoteIds(endt.quote_ids);
      const existingIds = allIds.filter(qid => existingQuoteIdSet.has(String(qid)));
      return {
        id,
        rawId: endt.endorsement_id || endt.document_library_id || endt.id,
        label: endt.title || endt.name || endt.code || 'Endorsement',
        category: endt.category,
        isRequired: endt.category === 'required' || endt.is_required,
        isAuto: endt.is_auto || endt.auto_attach_rules || endt.attachment_type === 'auto',
        isManuscript: endt.category === 'manuscript',
        quoteIds: existingIds,
      };
    }).filter(item => item.id && item.quoteIds.length > 0);
  }, [submissionEndorsementsData, existingQuoteIdSet]);

  // All submission subjectivities for submission scope view
  // Filter out orphaned items (no quotes linked) since they serve no purpose
  const allSubmissionSubjectivities = useMemo(() => {
    const subjectivities = submissionSubjectivitiesData || [];
    return subjectivities.map(subj => {
      const id = String(subj.id || '');
      const allIds = parseQuoteIds(subj.quote_ids);
      const existingIds = allIds.filter(qid => existingQuoteIdSet.has(String(qid)));
      return {
        id,
        rawId: subj.id,
        label: subj.text || subj.subjectivity_text || subj.title || 'Subjectivity',
        status: subj.status || 'pending',
        isRequired: subj.is_required || subj.category === 'required',
        quoteIds: existingIds,
      };
    }).filter(item => item.id && item.quoteIds.length > 0);
  }, [submissionSubjectivitiesData, existingQuoteIdSet]);

  const restoreSubjectivity = useMutation({
    mutationFn: (subjectivityId) => linkSubjectivityToQuote(structureId, subjectivityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    },
  });

  const restoreEndorsement = useSimpleMutation({
    mutationFn: (endorsementId) => linkEndorsementToQuote(structureId, endorsementId),
    invalidateKeys: [['quote-endorsements', structureId], ['submissionEndorsements', submissionId]],
  });

  // Update subjectivity status mutation (for inline editing in expanded card)
  const updateSubjectivityStatusMutation = useOptimisticMutation({
    mutationFn: ({ subjectivityId, status }) => updateSubjectivity(subjectivityId, { status }),
    queryKey: ['quote-subjectivities', structureId],
    optimisticUpdate: (old, { subjectivityId, status }) =>
      (old || []).map(s => s.id === subjectivityId ? { ...s, status } : s),
    invalidateKeys: [['submissionSubjectivities', submissionId]],
  });

  // Subjectivity templates (library) - only fetch when picker is open
  const { data: subjectivityTemplatesData } = useQuery({
    queryKey: ['subjectivity-templates'],
    queryFn: () => getSubjectivityTemplates().then(r => r.data),
    enabled: showLibraryPicker,
  });
  const subjectivityTemplates = subjectivityTemplatesData || [];

  // Filter out already-linked templates
  const linkedTemplateIds = new Set(subjectivities.map(s => s.subjectivity_id || s.template_id));
  const availableTemplates = subjectivityTemplates.filter(t => !linkedTemplateIds.has(t.id));

  // Endorsement library - only fetch when picker is open
  const { data: endorsementLibraryData } = useQuery({
    queryKey: ['endorsement-library'],
    queryFn: () => getDocumentLibraryEntries({ document_type: 'endorsement', status: 'active' }).then(r => r.data),
    enabled: showEndorsementLibraryPicker,
  });
  const endorsementLibrary = endorsementLibraryData || [];

  // Filter out already-linked endorsements
  const linkedEndorsementIds = new Set(endorsements.map(e => e.endorsement_id || e.document_library_id));
  const availableLibraryEndorsements = endorsementLibrary.filter(e => !linkedEndorsementIds.has(e.id));

  // Count how many OTHER quotes share this subjectivity (excludes current quote)
  const getSharedQuoteCount = (item) => {
    if (!item?.quoteIds || !Array.isArray(item.quoteIds)) return 0;
    return item.quoteIds.filter(id => String(id) !== String(structureId)).length;
  };

  // Update subjectivity text mutation
  const updateSubjectivityTextMutation = useOptimisticMutation({
    mutationFn: ({ subjectivityId, text }) => updateSubjectivity(subjectivityId, { text }),
    queryKey: ['quote-subjectivities', structureId],
    optimisticUpdate: (old, { subjectivityId, text }) =>
      (old || []).map(s => s.id === subjectivityId ? { ...s, text, subjectivity_text: text } : s),
    invalidateKeys: [['submissionSubjectivities', submissionId]],
  });

  // Create new custom subjectivity
  const createSubjectivityMutation = useSimpleMutation({
    mutationFn: (text) => createSubjectivity(submissionId, { text, quote_ids: [structureId] }),
    invalidateKeys: [['quote-subjectivities', structureId], ['submissionSubjectivities', submissionId]],
    onSuccess: () => {
      setNewSubjectivityText('');
      setIsAddingSubjectivity(false);
    },
  });

  // Link template from library
  const linkTemplateSubjectivity = useSimpleMutation({
    mutationFn: (templateId) => linkSubjectivityToQuote(structureId, templateId),
    invalidateKeys: [['quote-subjectivities', structureId], ['submissionSubjectivities', submissionId]],
    onSuccess: () => {
      setShowLibraryPicker(false);
      setLibrarySearchTerm('');
    },
  });

  // Unlink subjectivity from this quote
  const unlinkSubjectivityMutation = useOptimisticMutation({
    mutationFn: (subjectivityId) => unlinkSubjectivityFromQuote(structureId, subjectivityId),
    queryKey: ['quote-subjectivities', structureId],
    optimisticUpdate: (old, subjectivityId) => (old || []).filter(s => s.id !== subjectivityId),
    invalidateKeys: [['submissionSubjectivities', submissionId]],
  });

  // Toggle subjectivity link to any quote (for "Applies To" popover)
  const toggleSubjectivityLinkMutation = useOptimisticMutation({
    mutationFn: ({ subjectivityId, quoteId, isLinked }) =>
      isLinked ? unlinkSubjectivityFromQuote(quoteId, subjectivityId) : linkSubjectivityToQuote(quoteId, subjectivityId),
    queryKey: ['submissionSubjectivities', submissionId],
    optimisticUpdate: (old, { subjectivityId, quoteId, isLinked }) => {
      if (!old) return old;
      return old.map(subj => {
        if (String(subj.id) !== String(subjectivityId)) return subj;
        const currentIds = parseQuoteIds(subj.quote_ids);
        const newIds = isLinked
          ? currentIds.filter(id => String(id) !== String(quoteId))
          : [...currentIds, String(quoteId)];
        return { ...subj, quote_ids: newIds };
      });
    },
    getInvalidateKeys: () => [
      ['quote-subjectivities', structureId],
      ...allOptionIds.map(id => ['quote-subjectivities', id]),
    ],
  });

  // Bulk apply subjectivity to a set of quotes
  // Unlinks from all quotes when targetIds is empty
  const applySubjectivitySelectionMutation = useOptimisticMutation({
    mutationFn: async ({ subjectivityId, currentIds, targetIds }) => {
      if (targetIds.length === 0) {
        return Promise.all(currentIds.map(id => unlinkSubjectivityFromQuote(id, subjectivityId)));
      }
      const currentSet = new Set(currentIds.map(String));
      const targetSet = new Set(targetIds.map(String));
      const toLink = targetIds.filter(id => !currentSet.has(String(id)));
      const toUnlink = currentIds.filter(id => !targetSet.has(String(id)));
      await Promise.all([
        ...toLink.map(id => linkSubjectivityToQuote(id, subjectivityId)),
        ...toUnlink.map(id => unlinkSubjectivityFromQuote(id, subjectivityId)),
      ]);
    },
    queryKey: ['submissionSubjectivities', submissionId],
    optimisticUpdate: (old, { subjectivityId, targetIds }) => {
      if (!old) return old;
      if (targetIds.length === 0) {
        return old.filter(subj => String(subj.id) !== String(subjectivityId));
      }
      return old.map(subj => {
        if (String(subj.id) !== String(subjectivityId)) return subj;
        return { ...subj, quote_ids: targetIds };
      });
    },
    getInvalidateKeys: () => allOptionIds.map(id => ['quote-subjectivities', id]),
  });

  // Toggle endorsement link to any quote (for "Applies To" popover)
  const toggleEndorsementLinkMutation = useOptimisticMutation({
    mutationFn: ({ endorsementId, quoteId, isLinked }) =>
      isLinked ? unlinkEndorsementFromQuote(quoteId, endorsementId) : linkEndorsementToQuote(quoteId, endorsementId),
    queryKey: ['submissionEndorsements', submissionId],
    optimisticUpdate: (old, { endorsementId, quoteId, isLinked }) => {
      if (!old?.endorsements) return old;
      return {
        ...old,
        endorsements: old.endorsements.map(endt => {
          const endtId = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
          if (endtId !== String(endorsementId)) return endt;
          const currentIds = parseQuoteIds(endt.quote_ids);
          const newIds = isLinked
            ? currentIds.filter(id => String(id) !== String(quoteId))
            : [...currentIds, String(quoteId)];
          return { ...endt, quote_ids: newIds };
        }),
      };
    },
    getInvalidateKeys: () => [
      ['quote-endorsements', structureId],
      ...allOptionIds.map(id => ['quote-endorsements', id]),
    ],
  });

  // Bulk apply endorsement to a set of quotes
  // Unlinks from all quotes when targetIds is empty
  const applyEndorsementSelectionMutation = useOptimisticMutation({
    mutationFn: async ({ endorsementId, currentIds, targetIds }) => {
      if (targetIds.length === 0) {
        return Promise.all(currentIds.map(id => unlinkEndorsementFromQuote(id, endorsementId)));
      }
      const currentSet = new Set(currentIds.map(String));
      const targetSet = new Set(targetIds.map(String));
      const toLink = targetIds.filter(id => !currentSet.has(String(id)));
      const toUnlink = currentIds.filter(id => !targetSet.has(String(id)));
      await Promise.all([
        ...toLink.map(id => linkEndorsementToQuote(id, endorsementId)),
        ...toUnlink.map(id => unlinkEndorsementFromQuote(id, endorsementId)),
      ]);
    },
    queryKey: ['submissionEndorsements', submissionId],
    optimisticUpdate: (old, { endorsementId, targetIds }) => {
      if (!old?.endorsements) return old;
      if (targetIds.length === 0) {
        return {
          ...old,
          endorsements: old.endorsements.filter(endt => {
            const endtId = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
            return endtId !== String(endorsementId);
          }),
        };
      }
      return {
        ...old,
        endorsements: old.endorsements.map(endt => {
          const endtId = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
          if (endtId !== String(endorsementId)) return endt;
          return { ...endt, quote_ids: targetIds };
        }),
      };
    },
    getInvalidateKeys: () => allOptionIds.map(id => ['quote-endorsements', id]),
  });

  // Mutation: Update manuscript endorsement text
  const updateManuscriptEndorsementMutation = useOptimisticMutation({
    mutationFn: ({ endorsementId, text }) => updateDocumentLibraryEntry(endorsementId, { title: text }),
    queryKey: ['quote-endorsements', structureId],
    optimisticUpdate: (old, { endorsementId, text }) => {
      if (!old?.endorsements) return old;
      return {
        ...old,
        endorsements: old.endorsements.map(endt => {
          const endtId = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
          if (endtId !== String(endorsementId)) return endt;
          return { ...endt, title: text };
        }),
      };
    },
    invalidateKeys: [['submissionEndorsements', submissionId], ['endorsement-library']],
  });

  // Mutation: Apply current retro schedule to other quotes
  const applyRetroToQuotesMutation = useOptimisticMutation({
    mutationFn: async (targetQuoteIds) => {
      const schedule = structure?.retro_schedule || [];
      await Promise.all(targetQuoteIds.map(id => updateQuoteOption(id, { retro_schedule: schedule })));
    },
    queryKey: ['structures', submissionId],
    optimisticUpdate: (old, targetQuoteIds) => {
      const schedule = structure?.retro_schedule || [];
      return (old || []).map(s => targetQuoteIds.includes(String(s.id)) ? { ...s, retro_schedule: schedule } : s);
    },
    onSuccess: () => setShowRetroApplyPopover(false),
  });

  // Mutation: Apply policy term to quotes (for HoverCard click)
  const applyPolicyTermSelection = useOptimisticMutation({
    mutationFn: async ({ datesTbd, effectiveDate, expirationDate, quoteId }) => {
      const struct = structures.find(s => String(s.id) === String(quoteId));
      const firstVariation = struct?.variations?.[0];
      const updateData = datesTbd
        ? { dates_tbd: true, effective_date_override: null, expiration_date_override: null }
        : { dates_tbd: false, effective_date_override: effectiveDate || null, expiration_date_override: expirationDate || null };
      if (firstVariation) return updateVariation(firstVariation.id, updateData);
      else if (struct) return updateQuoteOption(quoteId, updateData);
    },
    queryKey: ['structures', submissionId],
    optimisticUpdate: (old, { datesTbd, effectiveDate, expirationDate, quoteId }) => {
      const updateData = datesTbd
        ? { dates_tbd: true, effective_date_override: null, expiration_date_override: null }
        : { dates_tbd: false, effective_date_override: effectiveDate, expiration_date_override: expirationDate };
      return (old || []).map(s => {
        if (String(s.id) === String(quoteId) && s.variations?.[0]) {
          return { ...s, variations: s.variations.map((v, idx) => idx === 0 ? { ...v, ...updateData } : v) };
        }
        return s;
      });
    },
  });

  // Mutation: Apply retro schedule to a specific quote (for HoverCard click)
  const applyRetroSelection = useOptimisticMutation({
    mutationFn: ({ schedule, quoteId }) => updateQuoteOption(quoteId, { retro_schedule: schedule }),
    queryKey: ['structures', submissionId],
    optimisticUpdate: (old, { schedule, quoteId }) =>
      (old || []).map(s => String(s.id) === String(quoteId) ? { ...s, retro_schedule: schedule } : s),
  });

  // Mutation: Apply commission to a specific quote (for HoverCard click)
  const applyCommissionSelection = useOptimisticMutation({
    mutationFn: ({ commission, quoteId }) => {
      const struct = structures.find(s => String(s.id) === String(quoteId));
      const firstVariation = struct?.variations?.[0];
      if (firstVariation) {
        return updateVariation(firstVariation.id, { commission_override: commission });
      }
    },
    queryKey: ['structures', submissionId],
    optimisticUpdate: (old, { commission, quoteId }) =>
      (old || []).map(s => {
        if (String(s.id) === String(quoteId) && s.variations?.[0]) {
          return {
            ...s,
            variations: s.variations.map((v, idx) => idx === 0 ? { ...v, commission_override: commission } : v),
          };
        }
        return s;
      }),
  });

  // Mutation: Create new manuscript endorsement and link to current quote
  const createManuscriptEndorsementMutation = useMutation({
    mutationFn: async (title) => {
      const code = `MS-${Date.now().toString(36).toUpperCase()}`;
      const result = await createDocumentLibraryEntry({
        code,
        document_type: 'endorsement',
        title,
        category: 'manuscript',
        status: 'active',
      });
      if (result.data?.id) {
        await linkEndorsementToQuote(structureId, result.data.id);
      }
      return result;
    },
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: ['quote-endorsements', structureId] });
      const previous = queryClient.getQueryData(['quote-endorsements', structureId]);
      const tempId = `temp-ms-${Date.now()}`;
      const optimisticEntry = {
        id: tempId,
        endorsement_id: tempId,
        title,
        code: 'MS-...',
        category: 'manuscript',
      };
      queryClient.setQueryData(['quote-endorsements', structureId], (old) => ({
        ...old,
        endorsements: [...(old?.endorsements || []), optimisticEntry],
      }));
      setNewEndorsementText('');
      setIsAddingEndorsement(false);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['quote-endorsements', structureId], ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['endorsement-library'] });
    },
  });

  // Mutation: Link endorsement from library to current quote
  const linkEndorsementFromLibraryMutation = useSimpleMutation({
    mutationFn: (endorsementId) => linkEndorsementToQuote(structureId, endorsementId),
    invalidateKeys: [['quote-endorsements', structureId], ['submissionEndorsements', submissionId]],
    onSuccess: () => {
      setShowEndorsementLibraryPicker(false);
    },
  });

  // Helper: count OTHER quotes sharing this endorsement (excludes current quote)
  const getEndorsementSharedQuoteCount = (item) => {
    if (!item?.quoteIds || !Array.isArray(item.quoteIds)) return 0;
    return item.quoteIds.filter(id => String(id) !== String(structureId)).length;
  };

  // Calculate tower info
  const tower = structure?.tower_json || [];
  const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
  const ourLimit = cmaiLayer?.limit || tower[0]?.limit || 0;
  // For bound quotes, use sold_premium; otherwise use tower premium
  const premium = structure?.sold_premium || cmaiLayer?.premium || 0;
  const commission = variation?.commission_override ?? 15;

  // For excess quotes: calculate attachment
  const isExcess = quoteType === 'excess';
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  const attachment = isExcess && cmaiIdx >= 0 ? calculateAttachment(tower, cmaiIdx) : 0;
  const primaryLayer = tower[0];
  const retention = primaryLayer?.retention || structure?.primary_retention || 25000;

  // Get coverage exceptions - different logic for primary vs excess
  const coverageExceptions = (() => {
    if (isExcess) {
      // Excess quotes use structure.sublimits array
      const excessSublimits = structure?.sublimits || [];
      return excessSublimits
        .filter(cov => cov.treatment === 'no_coverage' || cov.treatment === 'exclude' || cov.our_limit != null)
        .map(cov => ({
          id: cov.coverage,
          label: cov.coverage,
          value: cov.treatment === 'no_coverage' || cov.treatment === 'exclude' ? 'Excluded' : cov.our_limit,
          isExcluded: cov.treatment === 'no_coverage' || cov.treatment === 'exclude'
        }))
        .slice(0, 3);
    } else {
      // Primary quotes use structure.coverages.sublimit_coverages
      const coverages = structure?.coverages || {};
      const sublimits = coverages.sublimit_coverages || {};
      return SUBLIMIT_COVERAGES
        .filter(cov => sublimits[cov.id] !== undefined && sublimits[cov.id] !== cov.default)
        .map(cov => ({ id: cov.id, label: cov.label, value: sublimits[cov.id] }))
        .slice(0, 3);
    }
  })();

  // Get all sublimits with their current values (or defaults)
  const allSublimits = (() => {
    if (isExcess) {
      // Excess quotes - show from structure.sublimits with limit AND attachment
      const excessSublimits = structure?.sublimits || [];
      const primaryLimit = primaryLayer?.limit || 0;

      // Calculate proportional values for excess sublimits
      const calcProp = (primarySublimit) => {
        if (!primarySublimit || !primaryLimit) return { limit: 0, attachment };
        const ratio = primarySublimit / primaryLimit;
        const propLimit = Math.round(ratio * ourLimit);
        const propAttach = Math.round(ratio * attachment);
        return { limit: propLimit, attachment: propAttach };
      };

      return excessSublimits.map(cov => {
        const isExcluded = cov.treatment === 'no_coverage' || cov.treatment === 'exclude';
        const hasCustomLimit = cov.our_limit != null;
        const hasCustomAttach = cov.our_attachment != null;
        const prop = calcProp(cov.primary_limit);

        const effectiveLimit = isExcluded ? null : (cov.our_limit ?? prop.limit);
        const effectiveAttach = isExcluded ? null : (cov.our_attachment ?? prop.attachment);

        return {
          id: cov.coverage,
          label: cov.coverage,
          value: isExcluded ? 'Excluded' : effectiveLimit,
          attachment: effectiveAttach,
          defaultValue: cov.primary_limit,
          isException: isExcluded || hasCustomLimit || hasCustomAttach,
          isExcluded,
          isExcess: true,
          treatment: cov.treatment || 'follow_form', // 'follow_form' | 'different' | 'exclude' | 'no_coverage'
          isFollowForm: cov.treatment === 'follow_form' || !cov.treatment
        };
      });
    } else {
      // Primary quotes - use SUBLIMIT_COVERAGES with defaults
      const coverages = structure?.coverages || {};
      const sublimits = coverages.sublimit_coverages || {};
      return SUBLIMIT_COVERAGES.map(cov => {
        const value = sublimits[cov.id] !== undefined ? sublimits[cov.id] : cov.default;
        const isException = sublimits[cov.id] !== undefined && sublimits[cov.id] !== cov.default;
        return { id: cov.id, label: cov.label, value, defaultValue: cov.default, isException };
      });
    }
  })();

  // Format status text using same logic as grid
  const formatStatusText = (missing, extra, peerCount) => {
    const missingCount = missing.length;
    const extraCount = extra.length;

    if (peerCount === 0) {
      return { text: '', tone: '' }; // Don't show "No peers to compare"
    }
    if (missingCount === 0 && extraCount === 0) {
      return { text: `Aligned with ${peerLabel} peers`, tone: 'text-green-600' };
    }
    if (missingCount > 0 && extraCount === 0) {
      return { text: `${missingCount} missing from peers`, tone: 'text-amber-600' };
    }
    if (missingCount === 0 && extraCount > 0) {
      return { text: `${extraCount} extra (not on peers)`, tone: 'text-purple-600' };
    }
    return { text: `Mixed +${extraCount}, −${missingCount}`, tone: 'text-amber-600' };
  };

  const endorsementStatus = formatStatusText(missingEndorsements, uniqueEndorsements, peerIds.length);
  const subjectivityStatus = formatStatusText(missingSubjectivities, uniqueSubjectivities, peerIds.length);

  // CROSS-OPTION DRIFT items
  const crossOptionDrift = useMemo(() => {
    if (peerIds.length === 0) return [];

    const items = [];

    // Missing endorsements (peers have, we don't)
    missingEndorsements.slice(0, 3).forEach(endt => {
      items.push({
        id: `missing-endt-${endt.id}`,
        type: 'missing',
        category: 'endorsement',
        label: `Missing "${endt.label}"`,
        description: `${peerLabel} peers have this endorsement`,
        action: () => {},
      });
    });
    if (missingEndorsements.length > 3) {
      items.push({
        id: 'missing-endt-more',
        type: 'missing',
        category: 'endorsement',
        label: `+${missingEndorsements.length - 3} more missing endorsements`,
        action: () => {},
      });
    }

    // Extra endorsements (we have, peers don't)
    uniqueEndorsements.slice(0, 2).forEach(endt => {
      items.push({
        id: `extra-endt-${endt.id}`,
        type: 'extra',
        category: 'endorsement',
        label: `Has "${endt.label}"`,
        description: `Not on ${peerLabel} peers`,
        action: () => {},
      });
    });
    if (uniqueEndorsements.length > 2) {
      items.push({
        id: 'extra-endt-more',
        type: 'extra',
        category: 'endorsement',
        label: `+${uniqueEndorsements.length - 2} more unique endorsements`,
        action: () => {},
      });
    }

    // Missing subjectivities
    missingSubjectivities.slice(0, 2).forEach(subj => {
      items.push({
        id: `missing-subj-${subj.id}`,
        type: 'missing',
        category: 'subjectivity',
        label: `Missing "${subj.label}"`,
        description: `${peerLabel} peers have this subjectivity`,
        action: () => {},
      });
    });
    if (missingSubjectivities.length > 2) {
      items.push({
        id: 'missing-subj-more',
        type: 'missing',
        category: 'subjectivity',
        label: `+${missingSubjectivities.length - 2} more missing subjectivities`,
        action: () => {},
      });
    }

    // Extra subjectivities
    uniqueSubjectivities.slice(0, 2).forEach(subj => {
      items.push({
        id: `extra-subj-${subj.id}`,
        type: 'extra',
        category: 'subjectivity',
        label: `Has "${subj.label}"`,
        description: `Not on ${peerLabel} peers`,
        action: () => {},
      });
    });
    if (uniqueSubjectivities.length > 2) {
      items.push({
        id: 'extra-subj-more',
        type: 'extra',
        category: 'subjectivity',
        label: `+${uniqueSubjectivities.length - 2} more unique subjectivities`,
        action: () => {},
      });
    }

    return items;
  }, [peerIds, peerLabel, missingEndorsements, uniqueEndorsements, missingSubjectivities, uniqueSubjectivities]);

  return (
    <div className="space-y-6">
      {/* Quote Options Summary (Submission Mode) - Full width table */}
      {summaryScope === 'submission' && (
        <div ref={quoteOptionsRef} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
          {/* Collapsible header */}
          <button
            onClick={() => setShowQuoteOptions(!showQuoteOptions)}
            className="w-full bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 hover:bg-gray-100 transition-colors"
          >
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform ${showQuoteOptions ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-sm font-semibold text-gray-700">Quote Options</span>
            <span className="text-xs text-gray-400">({allOptions.length})</span>
          </button>
          {showQuoteOptions && (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wide">
                  <th className="py-2 pl-4 pr-2 text-left font-medium w-8">#</th>
                  <th className="py-2 px-2 text-left font-medium w-12">Type</th>
                  <th className="py-2 px-2 text-left font-medium">Quote Option</th>
                  <th className="py-2 px-2 text-right font-medium w-28">Premium</th>
                  <th className="py-2 px-2 text-center font-medium w-14">Subjs</th>
                  <th className="py-2 px-2 text-center font-medium w-14">Endts</th>
                  <th className="py-2 px-2 text-center font-medium w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allOptions.map((opt, idx) => {
                  const struct = structures?.find(s => String(s.id) === String(opt.id));
                  const optTower = struct?.tower_json || [];
                  const cmaiLayer = optTower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
                  const optPremium = struct?.sold_premium || cmaiLayer?.premium || 0;
                  const draftPremium = premiumDraft[opt.id] ?? optPremium;
                  const optStatus = struct?.is_bound ? 'bound' : (struct?.status || 'draft');
                  const isExcess = getStructurePosition(struct) === 'excess';
                  const subjList = subjectivitiesByQuote.get(String(opt.id)) || [];
                  const endtList = endorsementsByQuote.get(String(opt.id)) || [];
                  const isSelected = String(selectedQuoteId) === String(opt.id);
                  // Get comparison stats for this quote
                  const stats = positionComparisonStats.get(String(opt.id)) || {
                    subjectivities: { total: 0, missing: [], extra: [] },
                    endorsements: { total: 0, missing: [], extra: [] },
                  };
                  const subjStats = stats.subjectivities;
                  const endtStats = stats.endorsements;
                  const subjDisplay = formatComparisonText(subjStats.missing, subjStats.extra);
                  const endtDisplay = formatComparisonText(endtStats.missing, endtStats.extra);
                  return (
                    <tr
                      key={opt.id}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => onSelect(opt.id)}
                    >
                      <td className={`py-2.5 pl-4 pr-2 text-xs text-gray-400 ${isSelected ? 'border-l-2 border-purple-500' : 'border-l-2 border-transparent'}`}>
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isExcess ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isExcess ? 'XS' : 'PRI'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={`text-sm font-medium ${isSelected ? 'text-purple-700' : 'text-gray-900'}`}>
                          {opt.name}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {isEditingPremiums ? (
                          <input
                            ref={el => premiumInputRefs.current[opt.id] = el}
                            type="text"
                            value={formatNumberWithCommas(draftPremium)}
                            onChange={(e) => {
                              const val = parseNumber(e.target.value);
                              updatePremiumDraft(opt.id, val);
                            }}
                            onKeyDown={(e) => handlePremiumKeyDown(e, opt.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-24 px-2 py-1 text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-300 text-sm"
                          />
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); enterPremiumEditMode(opt.id); }}
                            className="text-sm font-semibold text-green-600 hover:text-green-700"
                          >
                            {formatCurrency(optPremium)}
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {(subjList.length > 0 || subjStats.missing.length > 0) ? (
                          <HoverCard.Root openDelay={200} closeDelay={100}>
                            <HoverCard.Trigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className={`text-xs ${subjDisplay.tone} hover:opacity-80`}
                              >
                                {subjDisplay.text}
                              </button>
                            </HoverCard.Trigger>
                            <HoverCard.Portal>
                              <HoverCard.Content
                                className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3"
                                sideOffset={4}
                              >
                                {subjStats.missing.length > 0 && (
                                  <>
                                    <div className="text-[10px] text-amber-600 uppercase tracking-wide mb-1">Missing from peers</div>
                                    <div className="space-y-1 mb-3">
                                      {subjStats.missing.map(item => (
                                        <div key={item.id} className="text-xs text-gray-700 flex items-start gap-2">
                                          <span className="text-amber-400">•</span>
                                          <span>{item.label}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                                {subjStats.extra.length > 0 && (
                                  <>
                                    <div className="text-[10px] text-purple-600 uppercase tracking-wide mb-1">Extra (not on peers)</div>
                                    <div className="space-y-1">
                                      {subjStats.extra.map(item => (
                                        <div key={item.id} className="text-xs text-gray-700 flex items-start gap-2">
                                          <span className="text-purple-400">•</span>
                                          <span>{item.label}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                                {subjStats.missing.length === 0 && subjStats.extra.length === 0 && (
                                  <div className="text-xs text-gray-500">All subjectivities aligned with peers</div>
                                )}
                                <HoverCard.Arrow className="fill-white" />
                              </HoverCard.Content>
                            </HoverCard.Portal>
                          </HoverCard.Root>
                        ) : (
                          <span className="text-xs text-gray-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {(endtList.length > 0 || endtStats.missing.length > 0) ? (
                          <HoverCard.Root openDelay={200} closeDelay={100}>
                            <HoverCard.Trigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className={`text-xs ${endtDisplay.tone} hover:opacity-80`}
                              >
                                {endtDisplay.text}
                              </button>
                            </HoverCard.Trigger>
                            <HoverCard.Portal>
                              <HoverCard.Content
                                className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3"
                                sideOffset={4}
                              >
                                {endtStats.missing.length > 0 && (
                                  <>
                                    <div className="text-[10px] text-amber-600 uppercase tracking-wide mb-1">Missing from peers</div>
                                    <div className="space-y-1 mb-3">
                                      {endtStats.missing.map(item => (
                                        <div key={item.id} className="text-xs text-gray-700 flex items-start gap-2">
                                          <span className="text-amber-400">•</span>
                                          <span>{item.label}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                                {endtStats.extra.length > 0 && (
                                  <>
                                    <div className="text-[10px] text-purple-600 uppercase tracking-wide mb-1">Extra (not on peers)</div>
                                    <div className="space-y-1">
                                      {endtStats.extra.map(item => (
                                        <div key={item.id} className="text-xs text-gray-700 flex items-start gap-2">
                                          <span className="text-purple-400">•</span>
                                          <span>{item.label}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                                {endtStats.missing.length === 0 && endtStats.extra.length === 0 && (
                                  <div className="text-xs text-gray-500">All endorsements aligned with peers</div>
                                )}
                                <HoverCard.Arrow className="fill-white" />
                              </HoverCard.Content>
                            </HoverCard.Portal>
                          </HoverCard.Root>
                        ) : (
                          <span className="text-xs text-gray-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium inline-block ${
                          optStatus === 'bound' ? 'bg-green-100 text-green-700' :
                          optStatus === 'issued' ? 'bg-green-100 text-green-700' :
                          optStatus === 'approved' ? 'bg-blue-100 text-blue-700' :
                          optStatus === 'pending' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {optStatus.charAt(0).toUpperCase() + optStatus.slice(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* KPI Row - Policy Terms, Retro, Premium (quote mode only), Commission */}
      <div className={`grid gap-3 ${summaryScope === 'submission' ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'}`}>
        {/* Policy Terms Card */}
        <TermsCardContent
          structure={structure}
          variation={variation}
          submission={submission}
          summaryScope={summaryScope}
          termVariationGroups={termVariationGroups}
          allQuoteTerms={allQuoteTerms}
          expandedCard={expandedCard}
          setExpandedCard={setExpandedCard}
          termsCardRef={termsCardRef}
          editingTermKey={editingTermKey}
          setEditingTermKey={setEditingTermKey}
          editingTermEffective={editingTermEffective}
          setEditingTermEffective={setEditingTermEffective}
          editingTermExpiration={editingTermExpiration}
          setEditingTermExpiration={setEditingTermExpiration}
          editingTermDatesTbd={editingTermDatesTbd}
          setEditingTermDatesTbd={setEditingTermDatesTbd}
          isAddingTerm={isAddingTerm}
          setIsAddingTerm={setIsAddingTerm}
          newTermEffective={newTermEffective}
          setNewTermEffective={setNewTermEffective}
          newTermExpiration={newTermExpiration}
          setNewTermExpiration={setNewTermExpiration}
          newTermDatesTbd={newTermDatesTbd}
          setNewTermDatesTbd={setNewTermDatesTbd}
          newTermSelectedQuotes={newTermSelectedQuotes}
          setNewTermSelectedQuotes={setNewTermSelectedQuotes}
          termAppliesToPopoverId={termAppliesToPopoverId}
          setTermAppliesToPopoverId={setTermAppliesToPopoverId}
          onApplyPolicyTerm={(data) => applyPolicyTermSelection.mutate(data)}
        />

        {/* Retro Card */}
        <RetroCardContent
          structure={structure}
          submission={submission}
          summaryScope={summaryScope}
          retroVariationGroups={retroVariationGroups}
          allQuoteRetros={allQuoteRetros}
          expandedCard={expandedCard}
          setExpandedCard={setExpandedCard}
          retroCardRef={retroCardRef}
          editingRetroKey={editingRetroKey}
          setEditingRetroKey={setEditingRetroKey}
          inlineEditRetroSchedule={inlineEditRetroSchedule}
          setInlineEditRetroSchedule={setInlineEditRetroSchedule}
          isAddingRetro={isAddingRetro}
          setIsAddingRetro={setIsAddingRetro}
          inlineNewRetroSchedule={inlineNewRetroSchedule}
          setInlineNewRetroSchedule={setInlineNewRetroSchedule}
          newRetroSelectedQuotes={newRetroSelectedQuotes}
          setNewRetroSelectedQuotes={setNewRetroSelectedQuotes}
          retroAppliesToPopoverId={retroAppliesToPopoverId}
          setRetroAppliesToPopoverId={setRetroAppliesToPopoverId}
          showRetroApplyPopover={showRetroApplyPopover}
          setShowRetroApplyPopover={setShowRetroApplyPopover}
          retroMatchingPeerIds={retroMatchingPeerIds}
          allOptionIds={allOptionIds}
          allPrimaryIds={allPrimaryIds}
          allExcessIds={allExcessIds}
          allOptions={allOptions}
          structureId={structureId}
          onApplyRetroSelection={(data) => applyRetroSelection.mutate(data)}
          onApplyRetroToQuotes={(ids) => applyRetroToQuotesMutation.mutate(ids)}
        />

        {/* Premium - View only, shows sold (tower) + technical (rater) if different */}
        {/* Hidden in submission mode - premiums are shown in Quote Options table */}
        {summaryScope !== 'submission' && (() => {
          const sold = premium; // Tower CMAI premium = what we're charging
          const technical = variation?.technical_premium || 0; // From rater
          const hasTechnical = technical > 0 && Math.abs(sold - technical) > 1;
          const diff = technical > 0 ? ((sold - technical) / technical) * 100 : 0;
          return (
            <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
              {hasTechnical ? (
                <div className="flex items-end justify-between">
                  <div className="text-left">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Technical</div>
                    <div className="text-base font-bold text-gray-800">{formatCurrency(technical)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Sold</div>
                    <div className="text-base font-bold text-gray-800">{formatCurrency(sold)}</div>
                  </div>
                  <div className={`text-sm font-semibold text-right ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {diff >= 0 ? '+' : ''}{diff.toFixed(0)}%
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Premium</div>
                  <div className="text-base font-bold text-gray-800">{formatCurrency(sold)}</div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Commission Card */}
        <CommissionCardContent
          structure={structure}
          variation={variation}
          submission={submission}
          summaryScope={summaryScope}
          commissionVariationGroups={commissionVariationGroups}
          allQuoteCommissions={allQuoteCommissions}
          commission={commission}
          expandedCard={expandedCard}
          setExpandedCard={setExpandedCard}
          commissionCardRef={commissionCardRef}
          editingCommissionKey={editingCommissionKey}
          setEditingCommissionKey={setEditingCommissionKey}
          editingCommissionRate={editingCommissionRate}
          setEditingCommissionRate={setEditingCommissionRate}
          isAddingCommission={isAddingCommission}
          setIsAddingCommission={setIsAddingCommission}
          newCommissionRate={newCommissionRate}
          setNewCommissionRate={setNewCommissionRate}
          newCommissionSelectedQuotes={newCommissionSelectedQuotes}
          setNewCommissionSelectedQuotes={setNewCommissionSelectedQuotes}
          commissionAppliesToPopoverId={commissionAppliesToPopoverId}
          setCommissionAppliesToPopoverId={setCommissionAppliesToPopoverId}
          onApplyCommissionSelection={(data) => applyCommissionSelection.mutate(data)}
        />
      </div>

      {/* Tower Position & Structure Preview (Quote Mode only) */}
      {summaryScope !== 'submission' && (
        <TowerCard
          structure={structure}
          tower={tower}
          ourLimit={ourLimit}
          attachment={attachment}
          retention={retention}
          premium={premium}
          expandedCard={expandedCard}
          setExpandedCard={setExpandedCard}
          showOnlyOurLayer={showOnlyOurLayer}
          setShowOnlyOurLayer={setShowOnlyOurLayer}
          towerCardRef={towerCardRef}
          onUpdateOption={onUpdateOption}
          structureId={structureId}
        />
      )}

      {/* Grid Header with toggle */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">
          {summaryScope === 'submission' ? 'Submission Details' : 'Quote Details'}
        </h3>
        {/* Show Missing toggle - only in quote mode (peer comparison doesn't make sense for submission) */}
        {summaryScope !== 'submission' && (missingEndorsements.length > 0 || missingSubjectivities.length > 0) && (
          <button
            onClick={() => setShowMissingSuggestions(!showMissingSuggestions)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              showMissingSuggestions
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700'
            }`}
          >
            {showMissingSuggestions ? 'Hide Missing' : `Show Missing (${missingEndorsements.length + missingSubjectivities.length})`}
          </button>
        )}
      </div>

      {/* Details Grid - 3 column layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Coverages - expands right (cols 1-2) when editing, stays visible when others expand */}
        <CoveragesCardContent
          structure={structure}
          structureId={structureId}
          structures={structures}
          submission={submission}
          allSublimits={allSublimits}
          coverageExceptions={coverageExceptions}
          expandedCard={expandedCard}
          setExpandedCard={setExpandedCard}
          cachedIsExcess={cachedIsExcess}
          setCachedIsExcess={setCachedIsExcess}
          excessCoverageFilter={excessCoverageFilter}
          setExcessCoverageFilter={setExcessCoverageFilter}
          showAllSublimits={showAllSublimits}
          setShowAllSublimits={setShowAllSublimits}
          coveragesCardRef={coveragesCardRef}
          excessCoverageSaveRef={excessCoverageSaveRef}
          onUpdateOption={onUpdateOption}
        />

        {/* Endorsements Card */}
        <EndorsementsCard
          endorsements={endorsements}
          allSubmissionEndorsements={allSubmissionEndorsements}
          summaryScope={summaryScope}
          missingEndorsements={missingEndorsements}
          uniqueEndorsements={uniqueEndorsements}
          alignedEndorsements={alignedEndorsements}
          endorsementStatus={endorsementStatus}
          peerLabel={peerLabel}
          showMissingSuggestions={showMissingSuggestions}
          allOptions={allOptions}
          allOptionIds={allOptionIds}
          allPrimaryIds={allPrimaryIds}
          allExcessIds={allExcessIds}
          expandedCard={expandedCard}
          setExpandedCard={setExpandedCard}
          getEndorsementSharedQuoteCount={getEndorsementSharedQuoteCount}
          getEndorsementIcon={getEndorsementIcon}
          onRestoreEndorsement={(id) => restoreEndorsement.mutate(id)}
          onToggleLink={(endorsementId, quoteId, isLinked) => 
            toggleEndorsementLinkMutation.mutate({ endorsementId, quoteId, isLinked })
          }
          onApplySelection={(endorsementId, currentIds, targetIds) => 
            applyEndorsementSelectionMutation.mutate({ endorsementId, currentIds, targetIds })
          }
          onUpdateManuscriptText={(endorsementId, text) => 
            updateManuscriptEndorsementMutation.mutate({ endorsementId, text })
          }
          onCreateManuscript={(text) => createManuscriptEndorsementMutation.mutate(text)}
          onLinkFromLibrary={(id) => linkEndorsementFromLibraryMutation.mutate(id)}
          onLibraryPickerOpenChange={setShowEndorsementLibraryPicker}
          availableLibraryEndorsements={availableLibraryEndorsements}
        />


        {/* Subjectivities Card */}
        <SubjectivitiesCard
          subjectivities={subjectivities}
          allSubmissionSubjectivities={allSubmissionSubjectivities}
          summaryScope={summaryScope}
          missingSubjectivities={missingSubjectivities}
          uniqueSubjectivities={uniqueSubjectivities}
          alignedSubjectivities={alignedSubjectivities}
          subjectivityStatus={subjectivityStatus}
          peerLabel={peerLabel}
          showMissingSuggestions={showMissingSuggestions}
          allOptions={allOptions}
          allOptionIds={allOptionIds}
          allPrimaryIds={allPrimaryIds}
          allExcessIds={allExcessIds}
          structureId={structureId}
          expandedCard={expandedCard}
          setExpandedCard={setExpandedCard}
          getSharedQuoteCount={getSharedQuoteCount}
          onUpdateStatus={(subjectivityId, status) =>
            updateSubjectivityStatusMutation.mutate({ subjectivityId, status })
          }
          onUpdateText={(subjectivityId, text) =>
            updateSubjectivityTextMutation.mutate({ subjectivityId, text })
          }
          onCreate={(text) => createSubjectivityMutation.mutate(text)}
          onUnlink={(subjectivityId) => unlinkSubjectivityMutation.mutate(subjectivityId)}
          onToggleLink={(subjectivityId, quoteId, isLinked) =>
            toggleSubjectivityLinkMutation.mutate({ subjectivityId, quoteId, isLinked })
          }
          onApplySelection={(subjectivityId, currentIds, targetIds) =>
            applySubjectivitySelectionMutation.mutate({ subjectivityId, currentIds, targetIds })
          }
          onRestore={(id) => restoreSubjectivity.mutate(id)}
          onLinkFromLibrary={(id) => linkTemplateSubjectivity.mutate(id)}
          onLibraryPickerOpenChange={setShowLibraryPicker}
          availableTemplates={availableTemplates}
        />

      </div>

      {/* Notes - Full width below the grid (hidden in submission mode since notes are per-quote) */}
      {summaryScope !== 'submission' && (
        <NotesCard structure={structure} onSave={onUpdateOption} />
      )}

      {/* Compact Status Footer - Cross-Option Drift only (Bind Readiness moved to header) */}
      <div className="border-t border-gray-200 pt-4 mt-2">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          {/* Cross-Option Drift - inline */}
          {crossOptionDrift.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-gray-400 uppercase tracking-wide font-medium">Drift:</span>
              <HoverCard.Root openDelay={100} closeDelay={100}>
                <HoverCard.Trigger asChild>
                  <button className="text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {crossOptionDrift.length} difference{crossOptionDrift.length > 1 ? 's' : ''} from {peerLabel} peers
                  </button>
                </HoverCard.Trigger>
                <HoverCard.Portal>
                  <HoverCard.Content className="z-[9999] w-72 rounded-lg border border-gray-200 bg-white shadow-xl p-3" sideOffset={4}>
                    <div className="space-y-2">
                      {crossOptionDrift.slice(0, 5).map(item => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.type === 'missing' ? 'bg-amber-500' : 'bg-purple-500'}`} />
                            <span className="text-gray-700 truncate">{item.label}</span>
                          </div>
                          {item.action && (
                            <button
                              onClick={item.action}
                              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            >
                              →
                            </button>
                          )}
                        </div>
                      ))}
                      {crossOptionDrift.length > 5 && (
                        <div className="text-xs text-gray-400 pt-1">
                          +{crossOptionDrift.length - 5} more...
                        </div>
                      )}
                    </div>
                    <HoverCard.Arrow className="fill-white" />
                  </HoverCard.Content>
                </HoverCard.Portal>
              </HoverCard.Root>
            </div>
          )}
          {peerIds.length > 0 && crossOptionDrift.length === 0 && (
            <div className="flex items-center gap-3">
              <span className="text-gray-400 uppercase tracking-wide font-medium">Drift:</span>
              <span className="text-green-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Aligned with {peerLabel} peers
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Document History */}
      {documentHistory.length > 0 && (
        <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-xs font-bold text-gray-500 uppercase">Document History</h3>
            <span className="text-xs text-gray-400">{documentHistory.length} doc{documentHistory.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {documentHistory.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-gray-400 flex-shrink-0">{doc.document_number}</span>
                    <span className="text-gray-600 truncate">
                      {doc.quote_name || (doc.document_type === 'quote_excess' ? 'Excess' : 'Primary')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                    {doc.pdf_url && (
                      <a
                        href={doc.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:text-purple-800 text-xs font-medium"
                      >
                        View
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
