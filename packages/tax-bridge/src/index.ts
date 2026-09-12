/**
 * Book-to-tax bridge stub. Phase A is book GL only (USD, en-US).
 * TODO(Phase F): M-1 / 8825 bridge, depreciation lives, bonus, 163(j), K-1 mapping.
 */

export const TAX_BRIDGE_STATUS = "not_implemented" as const;

export function taxBridgeUnavailable(): never {
  throw new Error("Tax bridge is Phase F. Book net income is not a taxable-income figure.");
}
