// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Field Formats
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// Presentation hint for a field's value. Orthogonal to dataType — the wire type
// is unchanged (markdown stays a string), this only drives how the value renders.
export const FIELD_FORMAT = {
  TEXT: 'text',
  MARKDOWN: 'markdown',
} as const

export type FieldFormat = (typeof FIELD_FORMAT)[keyof typeof FIELD_FORMAT]
export const FIELD_FORMATS = Object.values(
  FIELD_FORMAT,
) as readonly FieldFormat[]
