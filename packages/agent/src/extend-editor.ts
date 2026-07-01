import type { EdgeStatus, NodeData, NodeStatus } from '@wayflow/core'
import type { NodeTypeDefinition, NodeTypeRegistry } from './node-types'
import type { PortTypeRegistry } from './port-types'

export interface WorkflowEditorExtension {
  getRegisteredNodeTypes: () => NodeTypeRegistry
  getNodeTypeDefinition: (type: string) => NodeTypeDefinition | undefined
  getRegisteredPortTypes: () => PortTypeRegistry
  getNodeConfig: (nodeId: string) => NodeData
  updateNodeConfig: (nodeId: string, updates: NodeData) => void
  setNodeStatus: (nodeId: string, status: NodeStatus) => void
  setEdgeStatus: (edgeId: string, status: EdgeStatus) => void
  clearExecutionState: () => void
}
