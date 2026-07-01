import type { WorkflowEditor } from 'wayflow'

// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  The example workflow
//
//  A batch "Support Ticket Triage" that exercises the
//  multiple-items features end to end: a list input, an
//  LLM that runs once per item, Merge `zip` to recombine
//  the per-item results, and Array Operations to filter
//  and count them.
//
//  Seeded inside editor.untracked() so it doesn't land in
//  the user's undo history.
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

export const seedExampleWorkflow = (editor: WorkflowEditor): void => {
  editor.untracked(() => {
    editor.setMetadata({
      name: 'Support Ticket Triage',
      description:
        'Classify a batch of tickets with AI — one run per ticket — then recombine, filter, and summarize the high-priority ones.',
    })

    // A single field holding many values ("Multiple values"): the whole batch
    // flows down one port as a list.
    const input = editor.addNode({
      type: 'input',
      position: { x: 80, y: 360 },
      data: {
        fields: [
          {
            name: 'tickets',
            dataType: 'string',
            multiple: true,
            default: [
              'I was charged twice for my subscription this month and need a refund.',
              'The export button does nothing when I click it on the reports page.',
              'How do I change the email address on my account?',
              "Your service has been down for 3 hours and it's costing us money — this is unacceptable.",
              'Just wanted to say the new dashboard looks great. Thanks!',
            ],
          },
        ],
      },
    })

    // "Run once per item": the handler is written for one ticket; the runtime
    // iterates the list and collects each output port back into a list.
    const classify = editor.addNode({
      type: 'llm',
      position: { x: 420, y: 320 },
      data: {
        model: 'qwen3.5:9b',
        runPerItem: true,
        prompt:
          'Triage this customer support ticket. Return JSON with:\n' +
          '- category: one of "billing", "technical", "account", "feedback"\n' +
          '- urgency: one of "low", "medium", "high"\n' +
          '- summary: a one-sentence summary\n\n' +
          'Ticket:\n{ticket}',
        outputSchema: [
          { name: 'category', dataType: 'string' },
          { name: 'urgency', dataType: 'string' },
          { name: 'summary', dataType: 'string' },
        ],
      },
    })
    editor.setNodeName(classify.id, 'Classify Ticket')

    // The per-item node produced three parallel lists (category/urgency/summary).
    // Merge `zip` pairs them by index back into one list of per-ticket records.
    const combine = editor.addNode({
      type: 'merge',
      position: { x: 820, y: 320 },
      data: {
        mode: 'zip',
        fields: [
          { name: 'category', dataType: 'any' },
          { name: 'urgency', dataType: 'any' },
          { name: 'summary', dataType: 'any' },
        ],
      },
    })
    editor.setNodeName(combine.id, 'Combine Per Ticket')

    // Array Operations: keep only the high-urgency records (filter by a field).
    const highPriority = editor.addNode({
      type: 'arrayOps',
      position: { x: 1160, y: 220 },
      data: {
        operation: {
          op: 'filter',
          field: 'urgency',
          operator: 'contains',
          value: 'high',
        },
      },
    })
    editor.setNodeName(highPriority.id, 'High Priority Only')

    // Array Operations: a reducing op — the list collapses to a single number.
    const count = editor.addNode({
      type: 'arrayOps',
      position: { x: 1160, y: 460 },
      data: { operation: { op: 'count' } },
    })
    editor.setNodeName(count.id, 'Count High Priority')

    // A plain (non-per-item) LLM receives the whole list; it renders into the
    // prompt as readable text, so the model summarizes the batch at once.
    const digest = editor.addNode({
      type: 'llm',
      position: { x: 1500, y: 220 },
      data: {
        model: 'qwen3.5:9b',
        prompt:
          'Write a brief daily digest for the support team about these ' +
          'high-priority tickets: a one-line intro, then one bullet per ' +
          'ticket.\n\n{tickets}',
        outputSchema: [
          { name: 'digest', dataType: 'string', format: 'markdown' },
        ],
      },
    })
    editor.setNodeName(digest.id, 'Daily Digest')

    const output = editor.addNode({
      type: 'output',
      position: { x: 1840, y: 320 },
      data: {
        fields: [
          { name: 'digest', dataType: 'string', format: 'markdown' },
          { name: 'highPriorityCount', dataType: 'number' },
          { name: 'allClassified', dataType: 'json' },
        ],
      },
    })

    editor.addEdge({
      sourceNodeId: input.id,
      sourcePortId: 'tickets',
      targetNodeId: classify.id,
      targetPortId: 'ticket',
    })
    for (const port of ['category', 'urgency', 'summary']) {
      editor.addEdge({
        sourceNodeId: classify.id,
        sourcePortId: port,
        targetNodeId: combine.id,
        targetPortId: port,
      })
    }
    editor.addEdge({
      sourceNodeId: combine.id,
      sourcePortId: 'output',
      targetNodeId: highPriority.id,
      targetPortId: 'list',
    })
    editor.addEdge({
      sourceNodeId: highPriority.id,
      sourcePortId: 'result',
      targetNodeId: count.id,
      targetPortId: 'list',
    })
    editor.addEdge({
      sourceNodeId: highPriority.id,
      sourcePortId: 'result',
      targetNodeId: digest.id,
      targetPortId: 'tickets',
    })
    editor.addEdge({
      sourceNodeId: digest.id,
      sourcePortId: 'digest',
      targetNodeId: output.id,
      targetPortId: 'digest',
    })
    editor.addEdge({
      sourceNodeId: count.id,
      sourcePortId: 'result',
      targetNodeId: output.id,
      targetPortId: 'highPriorityCount',
    })
    editor.addEdge({
      sourceNodeId: combine.id,
      sourcePortId: 'output',
      targetNodeId: output.id,
      targetPortId: 'allClassified',
    })
  })
}
