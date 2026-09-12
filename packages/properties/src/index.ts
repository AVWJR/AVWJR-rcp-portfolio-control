/** Property / unit master. Phase A stores unitCount on SPE entities only. */

export const SPE_STRATEGIES = ["VALUE_ADD_GARDEN", "STABILIZED", "LIGHT_REHAB"] as const;
export type SpeStrategy = (typeof SPE_STRATEGIES)[number];

export type PropertyStub = {
  speCode: string;
  unitCount: number;
  strategy: SpeStrategy;
};

// TODO(Phase B): unit file, floorplans, occupancy from PMS — do not infer occupancy from GL
export function phaseBOccupancyTodo(): string {
  return "Occupancy is gated on the unit/PMS feed (Phase B). Do not derive it from rent GL.";
}
