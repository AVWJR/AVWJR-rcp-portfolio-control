/** Test deals stay out of the Library until the owner asks to see them. */
export function visibleLibraryRows<T extends { dealStatus: string }>(rows: T[], showTest: boolean): T[] {
  if (showTest) return rows;
  return rows.filter((row) => row.dealStatus !== "TEST");
}
