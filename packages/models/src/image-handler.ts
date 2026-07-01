import { createError, ERROR_CODE, resolveImageSize } from '@wayflow/agent'
import type { ModelHandler } from './dispatch'
import type { ImageProvider } from './image-provider'
import { fillTemplate, mergeVariableDefaults } from './template'

// Adapts an ImageProvider into a model handler: fills the prompt, resolves the
// size, generates, and returns the image ref. Returns (not yields) so the ref
// becomes the node's output instead of streaming as text.
export const createImageModelHandler = (
  provider: ImageProvider,
): ModelHandler => {
  return async (node, inputs, ctx) => {
    const vars = mergeVariableDefaults(node, inputs)
    ctx.reportInputs(vars)
    const prompt = fillTemplate(String(node.data.prompt ?? ''), vars)
    const negativePrompt = String(node.data.negativePrompt ?? '').trim()
    const seed = node.data.seed
    const { images } = await provider.generate({
      model: String(node.data.model ?? ''),
      prompt,
      size: resolveImageSize(node.data.size),
      negativePrompt: negativePrompt || undefined,
      seed: typeof seed === 'number' ? seed : undefined,
      signal: ctx.signal,
    })
    const image = images[0]
    if (!image) throw createError(ERROR_CODE.IMAGE_NO_OUTPUT)
    return image
  }
}
