export type CanonicalField = 'date' | 'description' | 'amount' | 'account_id' | 'source';

export type CsvRow = Record<string, string>;

export interface NormalizerContext {
  fileLabel: string;
  rowNumber: number;
}

export type CsvRowNormalizer = (row: CsvRow, context: NormalizerContext) => CsvRow;

export interface ColumnMappingConfig {
  columns?: Record<string, string>;
  defaults?: Record<string, string>;
}

export function createMappingNormalizer(config: ColumnMappingConfig): CsvRowNormalizer {
  const columnLookup = new Map<string, CanonicalField>();
  const defaults = new Map<CanonicalField, string>();

  if (config.columns) {
    for (const [incoming, canonicalTarget] of Object.entries(config.columns)) {
      const canonical = toCanonicalField(canonicalTarget);
      columnLookup.set(normalizeIncomingKey(incoming), canonical);
    }
  }

  if (config.defaults) {
    for (const [field, value] of Object.entries(config.defaults)) {
      const canonical = toCanonicalField(field);
      defaults.set(canonical, value);
    }
  }

  return (row) => {
    const remapped: CsvRow = { ...row };
    for (const [key, value] of Object.entries(row)) {
      const canonical = columnLookup.get(normalizeIncomingKey(key));
      if (canonical) {
        remapped[canonical] = value;
      }
    }

    defaults.forEach((value, field) => {
      const current = remapped[field];
      if (typeof current !== 'string' || current.trim() === '') {
        remapped[field] = value;
      }
    });

    return remapped;
  };
}

function normalizeIncomingKey(header: string): string {
  return header.trim().toLowerCase();
}

function toCanonicalField(value: string): CanonicalField {
  const normalized = value.trim().toLowerCase().replace(/[\s-]/g, '_');
  switch (normalized) {
    case 'date':
      return 'date';
    case 'description':
      return 'description';
    case 'amount':
      return 'amount';
    case 'account_id':
    case 'accountid':
      return 'account_id';
    case 'source':
      return 'source';
    default:
      throw new Error(`Unsupported canonical column "${value}" in normalization mapping`);
  }
}
