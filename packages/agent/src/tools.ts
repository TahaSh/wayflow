// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  [key: string]: unknown
}

export interface ToolMetadata {
  description: string
  parameters: JsonSchema
}

declare module '@wayflow/core' {
  interface GraphMetadata {
    exposedAsTool?: boolean
  }
}
