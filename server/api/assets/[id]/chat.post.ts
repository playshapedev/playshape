import { z } from 'zod'
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai'
import type { UIMessage } from 'ai'
import { eq, desc } from 'drizzle-orm'
import { assets, assetImages } from '~~/server/database/schema'
import { generateImage, getImageModelConfig, useActiveImageModel } from '~~/server/utils/imageGeneration'
import { generateAssetImageFilename, saveAssetFile, getAssetImageUrl } from '~~/server/utils/assetStorage'
import { askQuestionTool } from '~~/server/utils/tools/askQuestion'

const SYSTEM_PROMPT = `You are an AI assistant helping users create and edit images. Your role is to:

1. Help users describe what kind of image they want to create
2. Generate images using the generate_image tool when the user's intent is clear
3. Suggest improvements or variations when asked
4. Auto-name images with short, descriptive names (2-5 words) based on the content

When generating images:
- Create detailed, vivid prompts that will produce high-quality images
- Include style, mood, lighting, composition details when relevant
- If the user's request is vague, ask clarifying questions before generating
- After generating, describe what was created and offer to make variations

Always be helpful and creative. If the user wants to try different styles or variations, generate new images with modified prompts.`

export default defineLazyEventHandler(() => {
  return defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')
    if (!id) {
      throw createError({ statusCode: 400, statusMessage: 'Asset ID is required' })
    }

    const body = await readBody(event)
    const messages: UIMessage[] = body?.messages
    const modelId: string | undefined = body?.modelId // Optional: specific model to use

    if (!messages || !Array.isArray(messages)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid request: expected "messages" array, got ${typeof messages}`,
      })
    }

    // Patch ask_question tool calls that have no result.
    // The ask_question tool is client-side only (no execute), so tool results
    // may not be in the message history. convertToModelMessages requires every
    // tool call to have a result, so we inject a synthetic one.
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const p = part as Record<string, unknown>
        if (p.type === 'tool-ask_question' && p.state !== 'output-available') {
          p.state = 'output-available'
          p.output = p.output ?? { answered: true }
        }
      }
    }

    const db = useDb()
    const asset = db.select().from(assets).where(eq(assets.id, id)).get()
    if (!asset) {
      throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
    }

    // Get the text model for conversation (not image generation)
    let model
    try {
      ;({ model } = useActiveModel())
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No active LLM provider configured'
      throw createError({ statusCode: 409, statusMessage: message })
    }

    // Get image model config - either specified or active
    let imageModelConfig = modelId
      ? getImageModelConfig(modelId)
      : useActiveImageModel()

    if (!imageModelConfig) {
      throw createError({
        statusCode: 409,
        statusMessage: 'No image model configured. Go to Settings > AI Providers to enable an image model.',
      })
    }

    let convertedMessages
    try {
      convertedMessages = await convertToModelMessages(messages)
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process messages'
      throw createError({ statusCode: 400, statusMessage: message })
    }

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: convertedMessages,
      stopWhen: stepCountIs(3),
      maxOutputTokens: 2048,
      tools: {
        ask_question: askQuestionTool,
        get_asset: tool({
          description: 'Get the current asset details including name and all generated images.',
          inputSchema: z.object({}),
          execute: async () => {
            const current = db.select().from(assets).where(eq(assets.id, id)).get()
            if (!current) return { error: 'Asset not found' }

            // Get all images for this asset
            const images = db
              .select()
              .from(assetImages)
              .where(eq(assetImages.assetId, id))
              .orderBy(desc(assetImages.createdAt))
              .all()

            return {
              name: current.name,
              imageCount: images.length,
              images: images.map(img => ({
                id: img.id,
                prompt: img.prompt,
                width: img.width,
                height: img.height,
                mimeType: img.mimeType,
                fileUrl: getAssetImageUrl(id, img.id),
              })),
            }
          },
        }),

        generate_image: tool({
          description: 'Generate a new image from a text prompt and add it to this asset. Use detailed, descriptive prompts for best results. Each generation creates a new image in the history.',
          inputSchema: z.object({
            prompt: z.string().describe('Detailed description of the image to generate. Include style, mood, composition, lighting, and other relevant details.'),
            name: z.string().describe('A short, descriptive name for this asset (2-5 words, no file extension). Only used to update the asset name if this is the first image.'),
          }),
          execute: async ({ prompt, name }) => {
            try {
              // Generate the image
              const result = await generateImage(prompt, imageModelConfig!)

              // Create a new image record
              const imageId = crypto.randomUUID()
              const filename = generateAssetImageFilename(imageId, result.mimeType)
              saveAssetFile(filename, result.buffer)

              // Insert new image record
              db.insert(assetImages)
                .values({
                  id: imageId,
                  assetId: id,
                  prompt,
                  storagePath: filename,
                  mimeType: result.mimeType,
                  width: result.width ?? null,
                  height: result.height ?? null,
                  fileSize: result.buffer.length,
                  createdAt: new Date(),
                })
                .run()

              // Update asset name and timestamp
              db.update(assets)
                .set({
                  name,
                  updatedAt: new Date(),
                })
                .where(eq(assets.id, id))
                .run()

              return {
                success: true,
                imageId,
                name,
                prompt,
                width: result.width,
                height: result.height,
                fileUrl: getAssetImageUrl(id, imageId),
                mimeType: result.mimeType,
                fileSize: result.buffer.length,
              }
            }
            catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Image generation failed'
              return { success: false, error: message }
            }
          },
        }),
      },
    })

    return result.toUIMessageStreamResponse()
  })
})
