/**
 * CSV cells that survive being opened in a spreadsheet.
 *
 * Two separate hazards, both from text a participant typed:
 *
 *   - Structure. A title containing a comma, quote or newline has to be quoted,
 *     with inner quotes doubled, or it splits into extra columns and every
 *     column after it is shifted. The first ballot export only escaped the
 *     comment field, so a team called `Tea, "Earl" Grey` broke its row.
 *   - Formula injection. Excel, Sheets and LibreOffice run a cell that starts
 *     with = + - or @ as a formula. An entry titled `=HYPERLINK(...)` would
 *     execute on the organiser's machine the moment they opened the export.
 *     Such cells get a leading apostrophe, which spreadsheets treat as "this is
 *     text" and do not display.
 *
 * Numbers are written bare: they are ours, not user input, and a negative score
 * must stay a number rather than be defused into text.
 */

const FORMULA = /^[=+\-@\t\r]/;

export const csvCell = (value) => {
	if (value === null || value === undefined) return "";
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
	if (typeof value === "boolean") return value ? "yes" : "no";
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();

	let text = String(value);
	if (FORMULA.test(text)) text = `'${text}`;
	return `"${text.replace(/"/g, '""')}"`;
};

/**
 * A whole document: a header of plain column names, then one line per row.
 * Ends with a newline, as a text file should.
 */
export const toCsv = (header, rows) =>
	[header.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n") + "\n";

/** A percentage to one decimal, or null (an empty cell) when there is no score. */
export const pct = (fraction) => (typeof fraction === "number" && Number.isFinite(fraction) ? Math.round(fraction * 1000) / 10 : null);
