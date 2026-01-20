import { useState, useEffect } from 'react';
import { useOptimisticMutation } from '../../../hooks/useOptimisticMutation';
import { updateVariation, updateQuoteOption } from '../../../api/client';
import { formatCurrency } from '../../../utils/quoteUtils';
import { calculateNetOutPremium, calculateCommissionAmount, calculateNetToCarrier } from '../../../utils/commissionUtils';
import CommissionEditor from '../../CommissionEditor';
import NetOutEditor from '../../NetOutEditor';

/**
 * CommissionPanel - Commission and Net Out editor for quote mode
 *
 * Full-featured commission panel with net out calculations.
 * Used in the expanded Commission card when in quote mode.
 */
export default function CommissionPanel({ structure, variation, submissionId }) {
  const [commission, setCommission] = useState('15');
  const [netOutTo, setNetOutTo] = useState('');
  const [netOutApplied, setNetOutApplied] = useState(null); // { originalPremium, originalCommission, newPremium, newCommission, originalTower }

  // Get premium from CMAI layer
  const tower = structure?.tower_json || [];
  const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
  const grossPremium = cmaiLayer?.premium || 0;

  useEffect(() => {
    if (variation) {
      setCommission((variation.commission_override ?? 15).toString());
    }
  }, [variation?.id]);

  const updateCommissionMutation = useOptimisticMutation({
    mutationFn: (data) => updateVariation(variation.id, data),
    queryKey: ['structures', submissionId],
    optimisticUpdate: (old, data) =>
      (old || []).map(s => s.id === structure.id ? {
        ...s,
        variations: (s.variations || []).map(v => v.id === variation.id ? { ...v, ...data } : v)
      } : s),
  });

  const updateTowerMutation = useOptimisticMutation({
    mutationFn: (data) => updateQuoteOption(structure.id, data),
    queryKey: ['structures', submissionId],
    optimisticUpdate: (old, data) =>
      (old || []).map(s => s.id === structure.id ? { ...s, ...data } : s),
  });


  const commissionNum = parseFloat(commission) || 0;
  const brokerAmount = calculateCommissionAmount(grossPremium, commissionNum);
  const netToCarrier = calculateNetToCarrier(grossPremium, commissionNum);

  // Net out calculations
  const netOutNum = parseFloat(netOutTo) || 0;
  const newGross = calculateNetOutPremium(netToCarrier, netOutNum);
  const newCommissionAmount = newGross ? calculateCommissionAmount(newGross, netOutNum) : 0;

  const applyNetOut = async () => {
    if (!newGross) return;

    // Store original values for undo
    setNetOutApplied({
      originalPremium: grossPremium,
      originalCommission: commissionNum,
      newPremium: newGross,
      newCommission: netOutNum,
    });

    // Build updated tower with new premium
    const currentTower = structure?.tower_json || [];
    const updatedTower = currentTower.map(layer => {
      if (layer.carrier?.toUpperCase().includes('CMAI')) {
        return { ...layer, premium: newGross };
      }
      return layer;
    });

    // Update tower and commission sequentially to avoid race conditions
    await updateTowerMutation.mutateAsync({ tower_json: updatedTower });
    await updateCommissionMutation.mutateAsync({ commission_override: netOutNum });

    // Clear the net out input
    setNetOutTo('');
  };

  const undoNetOut = async () => {
    if (!netOutApplied) return;

    // Build tower with original premium from CURRENT tower structure
    const currentTower = structure?.tower_json || [];
    const restoredTower = currentTower.map(layer => {
      if (layer.carrier?.toUpperCase().includes('CMAI')) {
        return { ...layer, premium: netOutApplied.originalPremium };
      }
      return layer;
    });

    // Restore tower and commission sequentially
    await updateTowerMutation.mutateAsync({ tower_json: restoredTower });
    await updateCommissionMutation.mutateAsync({ commission_override: netOutApplied.originalCommission });

    // Clear the applied state
    setNetOutApplied(null);
  };

  return (
    <div className="space-y-4">
      {/* Commission Inputs - Side by Side */}
      <div className="grid grid-cols-2 gap-3">
        <CommissionEditor
              value={commission}
          onChange={setCommission}
          onBlur={(value) => {
            if (value !== variation.commission_override) {
              updateCommissionMutation.mutate({ commission_override: value });
            }
          }}
        />
        {!netOutApplied && (
          <NetOutEditor
                value={netOutTo}
            onChange={setNetOutTo}
            maxCommission={parseFloat(commission) || 100}
                placeholder={commission}
              />
        )}
      </div>

      {/* Breakdown */}
      <div className="pt-3 border-t border-gray-100 space-y-1.5">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Gross Premium</span>
          <span className="font-medium">{formatCurrency(grossPremium)}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Commission</span>
          <span className="font-medium text-red-600">-{formatCurrency(brokerAmount)}</span>
        </div>
        <div className="flex justify-between items-center text-sm pt-1.5 border-t border-gray-100">
          <span className="text-gray-700 font-medium">Net to Carrier</span>
          <span className="font-semibold text-green-600">{formatCurrency(netToCarrier)}</span>
        </div>
      </div>

      {/* Net Out Applied Summary */}
      {netOutApplied && (
        <div className="p-2 bg-purple-50 border border-purple-200 rounded-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-purple-700">Net Out Applied</span>
            <button
              onClick={undoNetOut}
              className="text-xs text-purple-600 hover:text-purple-800 font-medium"
            >
              Undo
            </button>
          </div>
          <div className="text-xs text-purple-600 space-y-0.5">
            <div>Commission: {netOutApplied.originalCommission}% → {netOutApplied.newCommission}%</div>
            <div>Premium: {formatCurrency(netOutApplied.originalPremium)} → {formatCurrency(netOutApplied.newPremium)}</div>
            <div>Commission Paid: {formatCurrency(netOutApplied.originalPremium * netOutApplied.originalCommission / 100)} → {formatCurrency(netOutApplied.newPremium * netOutApplied.newCommission / 100)}</div>
          </div>
        </div>
      )}

      {/* Net Out Preview */}
      {!netOutApplied && newGross && netOutNum < commissionNum && (
        <div className="p-2 bg-green-50 rounded-md space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">New Premium</span>
            <span className="font-medium">{formatCurrency(newGross)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Commission Paid</span>
            <span className="font-medium text-red-600">-{formatCurrency(newCommissionAmount)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Net to Carrier</span>
            <span className="font-medium">{formatCurrency(netToCarrier)}</span>
          </div>
          <button
            onClick={applyNetOut}
            className="mt-2 w-full text-xs font-medium py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
          >
            Apply Net Out
          </button>
        </div>
      )}
    </div>
  );
}
