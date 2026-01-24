import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Scatter,
} from 'recharts';
import { formatCompact } from '../../utils/quoteUtils';
import { getAnnualPremium } from '../../utils/premiumUtils';

/**
 * TowerPricingChart - Modal displaying tower pricing as RPM vs cumulative limit
 */
export default function TowerPricingChart({ tower, onClose }) {
  // Prepare chart data: sort by attachment ascending, calculate cumulative limit and RPM
  const { chartData, cmaiRpm, maxCumulative, maxRpm, totalProgramLimit } = useMemo(() => {
    if (!tower || tower.length === 0) return { chartData: [], cmaiRpm: 0, maxCumulative: 0, maxRpm: 0, totalProgramLimit: 0 };

    // Sort by attachment ascending (primary first)
    const sorted = [...tower].sort((a, b) => {
      const aAttach = a.calculatedAttachment ?? a.attachment ?? 0;
      const bAttach = b.calculatedAttachment ?? b.attachment ?? 0;
      return aAttach - bAttach;
    });

    // Find CMAI layer and its RPM
    const cmaiLayer = sorted.find(l => l.carrier?.toUpperCase().includes('CMAI'));
    const cmaiPremium = cmaiLayer ? getAnnualPremium(cmaiLayer) : 0;
    const cmaiRpmVal = cmaiLayer?.limit ? Math.round(cmaiPremium / (cmaiLayer.limit / 1_000_000)) : 0;

    let maxRpmVal = cmaiRpmVal;
    const data = sorted.map((layer) => {
      const attachment = layer.calculatedAttachment ?? layer.attachment ?? 0;
      const limit = layer.limit || 0;
      const premium = getAnnualPremium(layer);
      const rpm = limit > 0 ? Math.round(premium / (limit / 1_000_000)) : 0;
      const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');

      // Cumulative limit is attachment + limit (top of this layer)
      const cumulativeLimit = attachment + limit;

      // Track max RPM
      if (rpm > maxRpmVal) maxRpmVal = rpm;

      // Calculate savings vs CMAI
      const delta = rpm - cmaiRpmVal;
      const savingsPercent = rpm > 0 ? Math.round((delta / rpm) * 100) : 0;

      return {
        carrier: layer.carrier || 'TBD',
        attachment,
        limit,
        cumulativeLimit,
        premium,
        rpm,
        isCMAI,
        cmaiRpm: cmaiRpmVal,
        delta,
        savingsPercent,
        // For area fill: the "savings zone" between market rate and CMAI
        marketRpm: isCMAI ? cmaiRpmVal : rpm,
        cmaiFlat: cmaiRpmVal,
      };
    });

    const totalLimit = data.length > 0 ? data[data.length - 1].cumulativeLimit : 0;

    return {
      chartData: data,
      cmaiRpm: cmaiRpmVal,
      maxCumulative: totalLimit,
      maxRpm: maxRpmVal,
      totalProgramLimit: totalLimit,
    };
  }, [tower]);

  // Custom tooltip with comparison
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;

    const showSavings = !data.isCMAI && data.delta !== 0;

    return (
      <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-sm min-w-[200px]">
        <div className="font-semibold text-gray-800 mb-2 pb-2 border-b border-gray-100">
          {data.carrier}
        </div>
        <div className="space-y-1 text-gray-600">
          <div className="flex justify-between">
            <span>Cumulative Limit:</span>
            <span className="font-medium text-gray-800">{formatCompact(data.cumulativeLimit)}</span>
          </div>
          <div className="flex justify-between">
            <span>Layer:</span>
            <span className="text-gray-700">{formatCompact(data.limit)} xs {formatCompact(data.attachment)}</span>
          </div>
          <div className="flex justify-between">
            <span>Premium:</span>
            <span className="text-gray-700">${data.premium?.toLocaleString()}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-gray-100 mt-1">
            <span>{data.isCMAI ? 'CMAI RPM:' : 'This Carrier:'}</span>
            <span className="font-semibold text-gray-800">${data.rpm?.toLocaleString()}</span>
          </div>
          {!data.isCMAI && (
            <div className="flex justify-between">
              <span>CMAI Rate:</span>
              <span className="font-medium text-purple-600">${data.cmaiRpm?.toLocaleString()}</span>
            </div>
          )}
          {showSavings && (
            <div className="flex justify-between pt-1 border-t border-gray-100 mt-1">
              <span>Delta:</span>
              <span className={`font-semibold ${data.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.delta > 0 ? '+' : ''}{data.delta?.toLocaleString()}
                {data.savingsPercent !== 0 && ` (${data.delta > 0 ? '' : '+'}${-data.savingsPercent}%)`}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Tower Pricing Analysis</h2>
            <p className="text-xs text-gray-500 mt-0.5">Rate per million by cumulative limit</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Chart */}
        <div className="p-6">
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 20, right: 40, left: 20, bottom: 30 }}
              >
                <defs>
                  {/* Gradient for savings zone */}
                  <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  strokeOpacity={0.5}
                  vertical={false}
                />

                <XAxis
                  dataKey="cumulativeLimit"
                  type="number"
                  domain={[0, maxCumulative]}
                  tickFormatter={(value) => formatCompact(value)}
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#d1d5db' }}
                >
                  <label
                    value="Cumulative Limit"
                    position="insideBottom"
                    offset={-15}
                    fill="#6b7280"
                    fontSize={11}
                  />
                </XAxis>

                <YAxis
                  domain={[0, Math.ceil(maxRpm * 1.15 / 1000) * 1000]}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#d1d5db' }}
                  width={55}
                >
                  <label
                    value="RPM ($)"
                    angle={-90}
                    position="insideLeft"
                    offset={5}
                    fill="#6b7280"
                    fontSize={11}
                    style={{ textAnchor: 'middle' }}
                  />
                </YAxis>

                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: '#9ca3af', strokeDasharray: '3 3', strokeOpacity: 0.5 }}
                />

                {/* Savings zone - area between market rate and CMAI */}
                <Area
                  type="monotone"
                  dataKey="marketRpm"
                  stroke="none"
                  fill="url(#savingsGradient)"
                  baseValue={cmaiRpm}
                  isAnimationActive={false}
                />

                {/* CMAI flat rate reference line */}
                <ReferenceLine
                  y={cmaiRpm}
                  stroke="#9333ea"
                  strokeDasharray="6 4"
                  strokeWidth={2}
                  strokeOpacity={0.8}
                />

                {/* Market rate line (other carriers) */}
                <Line
                  type="monotone"
                  dataKey="rpm"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{
                    r: 6,
                    fill: '#6366f1',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                />

                {/* Total program limit marker */}
                <ReferenceLine
                  x={totalProgramLimit}
                  stroke="#d1d5db"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                  label={{
                    value: `Program: ${formatCompact(totalProgramLimit)}`,
                    position: 'top',
                    fill: '#9ca3af',
                    fontSize: 10,
                  }}
                />

                {/* CMAI point highlight */}
                <Scatter
                  dataKey="rpm"
                  shape={(props) => {
                    const { cx, cy, payload } = props;
                    if (!payload.isCMAI) return null;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={8}
                        fill="#9333ea"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legend - simplified */}
          <div className="flex items-center justify-center gap-8 mt-4 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-6 h-0.5 bg-indigo-500 rounded" />
              <span>Market Rate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <div className="w-6 border-t-2 border-dashed border-purple-600" />
                <div className="w-2 h-2 rounded-full bg-purple-600 -ml-1" />
              </div>
              <span>CMAI Rate</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 bg-green-500/15 border border-green-500/30 rounded-sm" />
              <span>Savings vs Market</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
