// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Types
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export interface WayflowErrorPayload {
  code: string
  message: string
  hint?: string
  docsUrl?: string
}

// `error` blocks the run; `warning` is advisory.
export const ISSUE_SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
} as const

export type IssueSeverity = (typeof ISSUE_SEVERITY)[keyof typeof ISSUE_SEVERITY]

export interface ValidationWarning extends WayflowErrorPayload {
  severity: IssueSeverity
  // Absent = graph-level; one id = node-specific; several = spans nodes (e.g. a cycle).
  nodeIds?: string[]
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Codes
//
//  Naming: WF_<PACKAGE>_<KIND>. Codes are stable contract; the message
//  wording can iterate without breaking consumers that match on code.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const ERROR_CODE = {
  RUNTIME_NO_HANDLER: 'WF_RUNTIME_NO_HANDLER',
  RUNTIME_HANDLER_THREW: 'WF_RUNTIME_HANDLER_THREW',
  RUNTIME_EMPTY_GRAPH: 'WF_RUNTIME_EMPTY_GRAPH',
  RUNTIME_CYCLE_DETECTED: 'WF_RUNTIME_CYCLE_DETECTED',
  RUNTIME_UNSCHEDULABLE_GRAPH: 'WF_RUNTIME_UNSCHEDULABLE_GRAPH',
  RUNTIME_MULTIPLE_NODES_FAILED: 'WF_RUNTIME_MULTIPLE_NODES_FAILED',
  RUNTIME_MISSING_INPUT: 'WF_RUNTIME_MISSING_INPUT',
  LLM_MODEL_NOT_FOUND: 'WF_LLM_MODEL_NOT_FOUND',
  LLM_OUTPUT_WRONG_TYPE: 'WF_LLM_OUTPUT_WRONG_TYPE',
  LLM_OUTPUT_INVALID_JSON: 'WF_LLM_OUTPUT_INVALID_JSON',
  LLM_OUTPUT_TRUNCATED: 'WF_LLM_OUTPUT_TRUNCATED',
  LLM_OUTPUT_NOT_OBJECT: 'WF_LLM_OUTPUT_NOT_OBJECT',
  LLM_OUTPUT_MISSING_FIELD: 'WF_LLM_OUTPUT_MISSING_FIELD',
  TEMPLATE_VAR_MISSING: 'WF_TEMPLATE_VAR_MISSING',
  LLM_IMAGE_URL_UNSUPPORTED: 'WF_LLM_IMAGE_URL_UNSUPPORTED',
  IMAGE_MODEL_NOT_FOUND: 'WF_IMAGE_MODEL_NOT_FOUND',
  IMAGE_GENERATION_FAILED: 'WF_IMAGE_GENERATION_FAILED',
  IMAGE_NO_OUTPUT: 'WF_IMAGE_NO_OUTPUT',
  AGENT_UNKNOWN_NODE_TYPE: 'WF_AGENT_UNKNOWN_NODE_TYPE',
  RUNTIME_INVALID_REGEX: 'WF_RUNTIME_INVALID_REGEX',
  RUNTIME_MULTI_PORT_MISMATCH: 'WF_RUNTIME_MULTI_PORT_MISMATCH',
  RUNTIME_MAP_MULTIPLE_LISTS: 'WF_RUNTIME_MAP_MULTIPLE_LISTS',
  RUNTIME_MAP_SUSPEND: 'WF_RUNTIME_MAP_SUSPEND',
  RUNTIME_HTTP_ERROR: 'WF_RUNTIME_HTTP_ERROR',
  RUNTIME_TOOL_NO_NAME: 'WF_RUNTIME_TOOL_NO_NAME',
  RUNTIME_TOOL_NOT_REGISTERED: 'WF_RUNTIME_TOOL_NOT_REGISTERED',
  RUNTIME_CHECKPOINT_STALE: 'WF_RUNTIME_CHECKPOINT_STALE',
  RUNTIME_PAUSE_IN_TOOL: 'WF_RUNTIME_PAUSE_IN_TOOL',
  RUNTIME_RECURSION_LIMIT: 'WF_RUNTIME_RECURSION_LIMIT',
  RUNTIME_REVIEW_NOT_RESUMABLE: 'WF_RUNTIME_REVIEW_NOT_RESUMABLE',
  VALIDATION_ORPHAN_NODE: 'WF_VALIDATION_ORPHAN_NODE',
  VALIDATION_NO_INPUT_NODE: 'WF_VALIDATION_NO_INPUT_NODE',
  VALIDATION_NO_OUTPUT_NODE: 'WF_VALIDATION_NO_OUTPUT_NODE',
  VALIDATION_VAR_UNSET: 'WF_VALIDATION_VAR_UNSET',
  VALIDATION_VAR_INVALID_NAME: 'WF_VALIDATION_VAR_INVALID_NAME',
  VALIDATION_LLM_NO_PROMPT: 'WF_VALIDATION_LLM_NO_PROMPT',
  VALIDATION_IMAGE_NO_PROMPT: 'WF_VALIDATION_IMAGE_NO_PROMPT',
  VALIDATION_TOOL_NOT_IN_CATALOG: 'WF_VALIDATION_TOOL_NOT_IN_CATALOG',
  VALIDATION_OUTPUT_FIELD_MISSING: 'WF_VALIDATION_OUTPUT_FIELD_MISSING',
  VALIDATION_OUTPUT_TYPE_MISMATCH: 'WF_VALIDATION_OUTPUT_TYPE_MISMATCH',
  VALIDATION_DUPLICATE_UNIQUE_NODE: 'WF_VALIDATION_DUPLICATE_UNIQUE_NODE',
} as const

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Catalog
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

interface ErrorDefinition {
  message: (params?: Record<string, unknown>) => string
  hint?: string
  docsUrl?: string
  severity?: IssueSeverity
}

const ERROR_DEFINITIONS: Record<ErrorCode, ErrorDefinition> = {
  [ERROR_CODE.RUNTIME_NO_HANDLER]: {
    message: (params) =>
      `No handler registered for node type "${params?.nodeType}"`,
  },
  [ERROR_CODE.RUNTIME_HANDLER_THREW]: {
    message: (params) => String(params?.reason ?? 'Unknown error'),
  },
  [ERROR_CODE.RUNTIME_EMPTY_GRAPH]: {
    message: () => 'Graph has no nodes',
  },
  [ERROR_CODE.RUNTIME_CYCLE_DETECTED]: {
    message: (params) =>
      `Graph contains a cycle (${params?.path}). Cyclic execution is not supported in v1.`,
  },
  [ERROR_CODE.RUNTIME_UNSCHEDULABLE_GRAPH]: {
    message: () =>
      'Graph is unschedulable (disconnected or already-failed dependency)',
  },
  [ERROR_CODE.RUNTIME_MULTIPLE_NODES_FAILED]: {
    message: (params) => `${params?.count} nodes failed: ${params?.summary}`,
  },
  [ERROR_CODE.LLM_MODEL_NOT_FOUND]: {
    message: (params) => `No handler registered for model "${params?.model}"`,
    hint: "Pick an available model in this node's config.",
  },
  [ERROR_CODE.LLM_OUTPUT_WRONG_TYPE]: {
    message: (params) =>
      `The model handler returned ${params?.type}, but this node has a structured output schema`,
  },
  [ERROR_CODE.LLM_OUTPUT_INVALID_JSON]: {
    message: (params) =>
      `The model returned text that isn't valid JSON: ${params?.reason}`,
    hint: 'Increase Max Tokens if the output was cut off, ask for JSON explicitly in the prompt, or try a different model.',
  },
  [ERROR_CODE.LLM_OUTPUT_TRUNCATED]: {
    message: () =>
      'The model hit its output-token limit before completing the structured response',
    hint: "Increase Max Tokens in this node's config.",
  },
  [ERROR_CODE.LLM_OUTPUT_NOT_OBJECT]: {
    message: () => "The model returned JSON that isn't an object",
    hint: 'Adjust the prompt to return a JSON object keyed by field name.',
  },
  [ERROR_CODE.LLM_OUTPUT_MISSING_FIELD]: {
    message: (params) =>
      `The model's output is missing the required field "${params?.field}" (expected: ${params?.expectedKeys})`,
    hint: 'Make sure the prompt asks the model to return every field in the output schema.',
  },
  [ERROR_CODE.TEMPLATE_VAR_MISSING]: {
    message: (params) => `Template variable "${params?.name}" has no value`,
    hint: "Connect an input to this variable's port, or set a default value in the node config.",
  },
  [ERROR_CODE.RUNTIME_MISSING_INPUT]: {
    message: (params) => `Input "${params?.field}" is required`,
    hint: 'Provide a value or a default for this input, or make it not required.',
  },
  [ERROR_CODE.LLM_IMAGE_URL_UNSUPPORTED]: {
    message: () =>
      "This model doesn't accept image URLs, only uploaded (base64) images",
    hint: 'Upload the image instead of pasting a URL.',
  },
  [ERROR_CODE.IMAGE_MODEL_NOT_FOUND]: {
    message: (params) => `No handler registered for model "${params?.model}"`,
    hint: "Pick an available model in this node's config.",
  },
  [ERROR_CODE.IMAGE_GENERATION_FAILED]: {
    message: (params) =>
      `Image generation failed: ${params?.reason ?? 'unknown error'}`,
    hint: 'Check the model name and that the requested size is supported by the backend (some models accept only specific dimensions).',
  },
  [ERROR_CODE.IMAGE_NO_OUTPUT]: {
    message: () => 'The image backend returned no image',
    hint: 'Verify the selected model supports image generation.',
  },
  [ERROR_CODE.AGENT_UNKNOWN_NODE_TYPE]: {
    message: (params) => `Unknown node type "${params?.type}"`,
  },
  [ERROR_CODE.RUNTIME_INVALID_REGEX]: {
    message: (params) =>
      `Conditional 'matches' has an invalid regex pattern "${params?.pattern}": ${params?.reason}`,
    hint: "Fix the regex pattern in this node's config.",
  },
  [ERROR_CODE.RUNTIME_MULTI_PORT_MISMATCH]: {
    message: (params) =>
      `Handler for node type "${params?.nodeType}" returned a single value, but the node has ${params?.portCount} output ports (${params?.portList}). Multi-port handlers must return an object keyed by port id.`,
  },
  [ERROR_CODE.RUNTIME_MAP_MULTIPLE_LISTS]: {
    message: () =>
      'This node runs once per item but received more than one list.',
    hint: 'Combine the lists into one with a Merge node so this node gets a single list.',
  },
  [ERROR_CODE.RUNTIME_MAP_SUSPEND]: {
    message: () =>
      "A node that runs once per item tried to pause for human review, which isn't supported mid-iteration.",
    hint: 'Move the Human Review node before or after the per-item node.',
  },
  [ERROR_CODE.RUNTIME_HTTP_ERROR]: {
    message: (params) =>
      `HTTP ${params?.status}${params?.detail ? `: ${params.detail}` : ''}`,
  },
  [ERROR_CODE.RUNTIME_TOOL_NO_NAME]: {
    message: () => 'Workflow has no name',
    hint: "Name the workflow in the editor's Settings so it can be used as a tool.",
  },
  [ERROR_CODE.RUNTIME_TOOL_NOT_REGISTERED]: {
    message: (params) =>
      `Graph references tool "${params?.name}" but no handler is registered`,
    hint: "Remove this tool from the node's Tools list.",
  },
  [ERROR_CODE.RUNTIME_CHECKPOINT_STALE]: {
    message: () =>
      "Can't resume: the graph's structure changed since this checkpoint was created. A checkpoint can only resume against the same nodes, ports, and connections it paused on (editing a node's config is fine; adding, removing, or rewiring nodes is not).",
  },
  [ERROR_CODE.RUNTIME_PAUSE_IN_TOOL]: {
    message: () =>
      'A workflow used as a tool tried to pause for human review, which a tool call cannot do.',
    hint: 'Remove the Human Review node from a workflow that runs as a tool.',
  },
  [ERROR_CODE.RUNTIME_REVIEW_NOT_RESUMABLE]: {
    message: () =>
      "This workflow has a human review step, but the editor isn't set up to handle it.",
  },
  [ERROR_CODE.RUNTIME_RECURSION_LIMIT]: {
    message: () =>
      'Workflows-as-tools nested too deeply. A workflow may be calling itself as a tool.',
  },
  [ERROR_CODE.VALIDATION_ORPHAN_NODE]: {
    message: () => "This node isn't connected to anything",
    hint: 'Connect it to the rest of the workflow, or remove it.',
  },
  [ERROR_CODE.VALIDATION_NO_INPUT_NODE]: {
    message: () => 'The workflow has no Input node',
    hint: 'Add an Input node so the workflow can receive data.',
  },
  [ERROR_CODE.VALIDATION_NO_OUTPUT_NODE]: {
    message: () => 'The workflow has no Output node',
    hint: 'Add an Output node so the run produces a result.',
  },
  [ERROR_CODE.VALIDATION_VAR_UNSET]: {
    message: (params) =>
      `Template variable "${params?.name}" has no input — it will be blank in the prompt`,
    hint: 'Connect its port, or give it a value under Variable Defaults.',
  },
  [ERROR_CODE.VALIDATION_VAR_INVALID_NAME]: {
    message: (params) => `Variable "${params?.name}" can't contain spaces`,
    hint: 'Use letters, numbers, and underscores instead — for example, image_1.',
  },
  [ERROR_CODE.VALIDATION_LLM_NO_PROMPT]: {
    message: () => 'This LLM node has no prompt',
    hint: 'Write a prompt or system prompt so the model has something to act on.',
  },
  [ERROR_CODE.VALIDATION_IMAGE_NO_PROMPT]: {
    message: () => 'This Image Generation node has no prompt',
    hint: 'Write a prompt describing the image to generate.',
  },
  [ERROR_CODE.VALIDATION_TOOL_NOT_IN_CATALOG]: {
    message: (params) => `Tool "${params?.name}" is not in the editor catalog`,
    hint: "Remove it from this node's Tools list.",
  },
  [ERROR_CODE.VALIDATION_OUTPUT_FIELD_MISSING]: {
    message: (params) =>
      `Output field "${params?.name}" wasn't produced by the last run`,
    hint: "Connect an input to this field's port.",
  },
  [ERROR_CODE.VALIDATION_OUTPUT_TYPE_MISMATCH]: {
    message: (params) =>
      `Output field "${params?.name}" expected ${params?.expected}, got ${params?.actual}`,
  },
  [ERROR_CODE.VALIDATION_DUPLICATE_UNIQUE_NODE]: {
    message: (params) => `A workflow can have only one ${params?.label} node`,
    hint: 'Keep only one.',
    severity: ISSUE_SEVERITY.ERROR,
  },
}

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Public API
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export class WayflowError extends Error {
  readonly code: string
  readonly hint?: string
  readonly docsUrl?: string

  constructor(opts: {
    code: string
    message: string
    hint?: string
    docsUrl?: string
    cause?: unknown
  }) {
    super(
      opts.message,
      opts.cause !== undefined ? { cause: opts.cause } : undefined,
    )
    this.name = 'WayflowError'
    this.code = opts.code
    this.hint = opts.hint
    this.docsUrl = opts.docsUrl
  }

  // `cause` is intentionally omitted — it may not be JSON-serializable and
  // consumers on the wire only need the user-facing fields.
  toJSON(): WayflowErrorPayload {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      docsUrl: this.docsUrl,
    }
  }
}

export const createError = (
  code: ErrorCode,
  params?: Record<string, unknown>,
  cause?: unknown,
): WayflowError => {
  const def = ERROR_DEFINITIONS[code]
  // Expose the cause's message to templates under `reason` so call sites
  // don't have to extract and pass it themselves.
  const enriched =
    cause instanceof Error ? { ...params, reason: cause.message } : params
  return new WayflowError({
    code,
    message: def.message(enriched),
    hint: def.hint,
    docsUrl: def.docsUrl,
    cause,
  })
}

export const createWarning = (
  code: ErrorCode,
  params?: Record<string, unknown>,
  nodeIds?: string[],
): ValidationWarning => {
  const def = ERROR_DEFINITIONS[code]
  return {
    code,
    message: def.message(params),
    hint: def.hint,
    docsUrl: def.docsUrl,
    severity: def.severity ?? ISSUE_SEVERITY.WARNING,
    nodeIds,
  }
}
