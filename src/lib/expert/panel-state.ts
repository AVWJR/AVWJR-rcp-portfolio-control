export type ExpertPanelState = "closed" | "open" | "minimized";

export type ExpertPanelAction = "open" | "close" | "minimize" | "toggle";

export function nextPanelState(state: ExpertPanelState, action: ExpertPanelAction): ExpertPanelState {
  if (action === "open") return "open";
  if (action === "close") return "closed";
  if (action === "minimize") return "minimized";
  if (state === "open") return "closed";
  return "open";
}

export function panelIsExpanded(state: ExpertPanelState): boolean {
  return state === "open";
}
