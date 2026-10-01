import { utils, write } from "xlsx";
import type { ColumnLayoutItem } from "./columns";
import { libraryTable } from "./csv";
import type { LibraryRow } from "./facts";

/** Excel workbook of the current Library view. Does not delete anything. */
export function libraryXlsxBytes(rows: LibraryRow[], layout: ColumnLayoutItem[]): Uint8Array {
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet(libraryTable(rows, layout));
  utils.book_append_sheet(book, sheet, "Library");
  const out = write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(out);
}
