import type { JsonSchema, ToolMetadata } from '@wayflow/agent'
import type { Tool, ToolHandlerContext } from './tools'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

type ArgPrimitive = 'string' | 'number' | 'boolean'

type ArgDecl = ArgPrimitive | { type: ArgPrimitive; description?: string }

type TypeOf<D> = D extends 'string'
  ? string
  : D extends 'number'
    ? number
    : D extends 'boolean'
      ? boolean
      : D extends { type: 'string' }
        ? string
        : D extends { type: 'number' }
          ? number
          : D extends { type: 'boolean' }
            ? boolean
            : never

type ArgsToValues<A> = {
  [K in keyof A]: TypeOf<A[K]>
}

export interface DefineToolOptions<A extends Record<string, ArgDecl>> {
  description: string
  args: A
  handler: (args: ArgsToValues<A>, ctx: ToolHandlerContext) => Promise<unknown>
}

export interface DefineToolMetadataOptions {
  description: string
  args: Record<string, ArgDecl>
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Factories
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const defineTool = <A extends Record<string, ArgDecl>>(
  opts: DefineToolOptions<A>,
): Tool => ({
  description: opts.description,
  parameters: buildParameters(opts.args),
  handler: opts.handler as Tool['handler'],
})

export const defineToolMetadata = (
  opts: DefineToolMetadataOptions,
): ToolMetadata => ({
  description: opts.description,
  parameters: buildParameters(opts.args),
})

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Internals
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

const buildParameters = (args: Record<string, ArgDecl>): JsonSchema => {
  const properties: Record<string, JsonSchema> = {}
  for (const [key, decl] of Object.entries(args)) {
    properties[key] =
      typeof decl === 'string'
        ? { type: decl }
        : decl.description
          ? { type: decl.type, description: decl.description }
          : { type: decl.type }
  }
  return {
    type: 'object',
    properties,
    required: Object.keys(args),
  }
}
