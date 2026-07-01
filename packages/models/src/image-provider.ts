// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
//  Image Provider Contract
// –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

// A generated image, as a data-URI or a remote URL.
export type ImageRef = string

export interface ImageGenRequest {
  model: string
  prompt: string
  size?: { width: number; height: number }
  // Concepts of diffusion backends; ignored by backends that don't support them.
  negativePrompt?: string
  seed?: number
  signal: AbortSignal
}

export interface ImageGenResult {
  images: ImageRef[]
}

export interface ImageProvider {
  generate(request: ImageGenRequest): Promise<ImageGenResult>
}
