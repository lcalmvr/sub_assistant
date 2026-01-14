/**
 * Commission calculation utilities
 * 
 * Shared functions for commission and net out calculations
 */

/**
 * Calculate net out values
 * Given a net-to-carrier amount and a target net out percentage,
 * calculates the new gross premium needed.
 * 
 * @param {number} netToCarrier - Current net to carrier amount
 * @param {number} netOutPercent - Target net out percentage (0-100)
 * @returns {number|null} - New gross premium, or null if invalid
 */
export function calculateNetOutPremium(netToCarrier, netOutPercent) {
  if (netOutPercent <= 0 || netOutPercent >= 100) return null;
  return Math.round(netToCarrier / (1 - netOutPercent / 100));
}

/**
 * Calculate commission amount from premium and percentage
 * 
 * @param {number} premium - Gross premium
 * @param {number} commissionPercent - Commission percentage (0-100)
 * @returns {number} - Commission amount
 */
export function calculateCommissionAmount(premium, commissionPercent) {
  return premium * (commissionPercent / 100);
}

/**
 * Calculate net to carrier from premium and commission
 * 
 * @param {number} premium - Gross premium
 * @param {number} commissionPercent - Commission percentage (0-100)
 * @returns {number} - Net to carrier amount
 */
export function calculateNetToCarrier(premium, commissionPercent) {
  return premium - calculateCommissionAmount(premium, commissionPercent);
}
