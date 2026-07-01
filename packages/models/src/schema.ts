import type { Field } from '@wayflow/agent'

export interface JsonSchema {
  type: 'object'
  properties: Record<string, { type: string }>
  required: string[]
  additionalProperties: false
}

const DATA_TYPE_TO_JSON_TYPE: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  json: 'object',
  any: 'string',
}

export const fieldsToJsonSchema = (fields: Field[]): JsonSchema => {
  const properties: Record<string, { type: string }> = {}
  const required: string[] = []
  for (const f of fields) {
    properties[f.name] = {
      type: DATA_TYPE_TO_JSON_TYPE[f.dataType] ?? 'string',
    }
    required.push(f.name)
  }
  return { type: 'object', properties, required, additionalProperties: false }
}

// True when the schema represents structured output: many fields, or one
// non-string field. A single string field is the plain-text default.
export const isStructured = (outputSchema: Field[] | undefined): boolean => {
  if (!outputSchema || outputSchema.length === 0) return false
  if (outputSchema.length > 1) return true
  return outputSchema[0].dataType !== 'string'
}

export const jsonSchemaInstructions = (schema: JsonSchema): string =>
  [
    'Respond with valid JSON matching this exact schema. Return only the JSON, no other text.',
    JSON.stringify(schema, null, 2),
  ].join('\n')

export const toPromptInstructions = (fields: Field[]): string =>
  jsonSchemaInstructions(fieldsToJsonSchema(fields))
