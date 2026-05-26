export function normalizeValue(value: unknown) {
  return String(value ?? '').trim();
}

export function splitCsvLine(line: string, separator: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      cells.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim().replace(/^"|"$/g, ''));
  return cells;
}

export function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    return [] as Record<string, string>[];
  }

  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = splitCsvLine(lines[0], separator);

  return lines.slice(1).map((line) =>
    Object.fromEntries(
      splitCsvLine(line, separator).map((cell, index) => [headers[index] || `col${index}`, cell])
    )
  );
}

export function buildCsv(headers: string[], rows: Array<Array<string | number>>) {
  return [headers, ...rows]
    .map((line) =>
      line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')
    )
    .join('\n');
}
