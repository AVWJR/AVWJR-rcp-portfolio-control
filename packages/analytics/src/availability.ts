export type RatioAvailability = {
  ready: boolean;
  phase: string;
  source: "rent_roll" | "gl" | "none";
  reason: string;
};
