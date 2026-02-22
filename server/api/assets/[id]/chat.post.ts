import { z } from 'zod'
import { streamText, tool, stepCountIs } from 'ai'
import type { UIMessage } from 'ai'
import { eq, desc } from 'drizzle-orm'
import { assets, assetImages, chatAttachments } from '~~/server/database/schema'
import { generateImage, getImageModelConfig, useActiveImageModel, DEFAULT_ASPECT_RATIO, type ReferenceImage } from '~~/server/utils/imageGeneration'
import { generateAssetImageFilename, saveAssetFile, getAssetImageUrl, readAssetFile } from '~~/server/utils/assetStorage'
import { readAttachmentFile } from '~~/server/utils/attachmentStorage'
import { askQuestionTool } from '~~/server/utils/tools/askQuestion'
import { compactContext } from '~~/server/utils/contextCompaction'
import { recordTokenUsage } from '~~/server/utils/tokens'
import { PLAN_MODE_INSTRUCTION, type ChatMode } from '~~/server/utils/chatMode'

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

Using reference images (image-to-image):
- When the user attaches an image, you can see it directly in their message
- To use an attached or generated image as reference for new generation, first call get_asset to find the image/attachment ID
- Then call generate_image with that ID as referenceImageId
- Reference images are used for: style transfer, creating variations, editing based on the original
- The most recently uploaded attachment or generated image is often what the user wants to reference
- If the user says things like "make it more blue" or "create a variation", they likely want you to use the recent image as reference

Viewing images:
- Use the get_image tool to view images from this asset's history
- Call get_image without arguments to see the most recent generated image
- If the user references an earlier image (e.g., "the first one", "the dark version"), first call get_asset to see all images and their prompts, then call get_image with the correct imageId

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
    const aspectRatio: string = body?.aspectRatio || DEFAULT_ASPECT_RATIO // Aspect ratio for generation
    const mode: ChatMode = body?.mode ?? 'build'

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
    let provider: { id: string } | null = null
    try {
      const active = useActiveModel()
      model = active.model
      provider = active.provider
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No active LLM provider configured'
      throw createError({ statusCode: 409, statusMessage: message })
    }

    // Get image model config - either specified or active
    const imageModelConfig = modelId
      ? getImageModelConfig(modelId)
      : useActiveImageModel()

    if (!imageModelConfig) {
      throw createError({
        statusCode: 409,
        statusMessage: 'No image model configured. Go to Settings > AI Providers to enable an image model.',
      })
    }

    // Apply plan mode instruction when in plan mode
    const systemPrompt = mode === 'plan'
      ? `${SYSTEM_PROMPT}\n\n${PLAN_MODE_INSTRUCTION}`
      : SYSTEM_PROMPT

    // Apply context compaction if needed
    const compaction = await compactContext(messages, systemPrompt, model)

    // ─── Read-only tools (available in both Plan and Build modes) ────────────
    const readOnlyTools = {
      ask_question: askQuestionTool,
      get_asset: tool({
          description: 'Get the current asset details including name, generated images, and user-uploaded attachments. Use this to find image IDs for use with generate_image\'s referenceImageId parameter.',
          inputSchema: z.object({}),
          execute: async () => {
            const current = db.select().from(assets).where(eq(assets.id, id)).get()
            if (!current) return { error: 'Asset not found' }

            // Get all generated images for this asset
            const images = db
              .select()
              .from(assetImages)
              .where(eq(assetImages.assetId, id))
              .orderBy(desc(assetImages.createdAt))
              .all()

            // Get all user-uploaded attachments for this asset
            const attachments = db
              .select()
              .from(chatAttachments)
              .where(eq(chatAttachments.assetId, id))
              .orderBy(desc(chatAttachments.createdAt))
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
              attachmentCount: attachments.length,
              attachments: attachments.map(att => ({
                id: att.id,
                filename: att.filename,
                width: att.width,
                height: att.height,
                mimeType: att.mimeType,
                uploadedAt: att.createdAt,
              })),
            }
          },
        }),

        get_image: tool({
          description: `Get metadata about an image from this asset's history. Call without arguments to get the most recent generated image. Provide an imageId to get a specific image. Note: This returns metadata only - the user can see the image in the UI, and you can reference it by ID for image-to-image generation.`,
          inputSchema: z.object({
            imageId: z.string().optional().describe('ID of a specific image to get. Omit to get the most recent image.'),
          }),
          execute: async ({ imageId }) => {
            // Find the image (most recent or by specific ID)
            const image = imageId
              ? db.select().from(assetImages).where(eq(assetImages.id, imageId)).get()
              : db.select().from(assetImages)
                  .where(eq(assetImages.assetId, id))
                  .orderBy(desc(assetImages.createdAt))
                  .limit(1)
                  .get()

            if (!image) {
              return { error: imageId ? `Image with ID ${imageId} not found` : 'No images in this asset yet' }
            }

            // Return metadata only - don't include actual image data in tool results
            // as it causes issues with LLM providers that can't handle images in JSON
            return {
              imageId: image.id,
              prompt: image.prompt,
              width: image.width,
              height: image.height,
              mimeType: image.mimeType,
              fileUrl: getAssetImageUrl(id, image.id),
            }
          },
        }),
      }

    // ─── Write tools (only available in Build mode) ──────────────────────────
    const writeTools = {
      generate_image: tool({
          description: 'Generate a new image from a text prompt and add it to this asset. Use detailed, descriptive prompts for best results. Each generation creates a new image in the history. Optionally use a reference image for image-to-image generation (style transfer, editing, variations).',
          inputSchema: z.object({
            prompt: z.string().describe('Detailed description of the image to generate. Include style, mood, composition, lighting, and other relevant details.'),
            name: z.string().describe('A short, descriptive name for this asset (2-5 words, no file extension). Only used to update the asset name if this is the first image.'),
            referenceImageId: z.string().optional().describe('Optional ID of an image to use as reference for image-to-image generation. Can be an attachment ID from the user\'s message or an image ID from this asset\'s history (get from get_asset).'),
          }),
          execute: async ({ prompt, name, referenceImageId }) => {
            try {
              // Look up reference image if provided
              let referenceImage: ReferenceImage | undefined

              if (referenceImageId) {
                // First try to find in asset_images (generated images)
                const assetImage = db.select().from(assetImages).where(eq(assetImages.id, referenceImageId)).get()

                if (assetImage) {
                  const buffer = readAssetFile(assetImage.storagePath)
                  if (buffer && assetImage.mimeType) {
                    referenceImage = { buffer, mimeType: assetImage.mimeType }
                  }
                }
                else {
                  // Try to find in chat_attachments (user-uploaded images)
                  const attachment = db.select().from(chatAttachments).where(eq(chatAttachments.id, referenceImageId)).get()

                  if (attachment) {
                    const buffer = readAttachmentFile(attachment.storagePath)
                    if (buffer) {
                      referenceImage = { buffer, mimeType: attachment.mimeType }
                    }
                  }
                }

                if (!referenceImage) {
                  return { success: false, error: `Reference image with ID ${referenceImageId} not found` }
                }
              }

              // Generate the image with the selected aspect ratio and optional reference
              const result = await generateImage(prompt, imageModelConfig!, {
                aspectRatio,
                referenceImage,
              })

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
                usedReferenceImage: !!referenceImageId,
              }
            }
            catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Image generation failed'
              return { success: false, error: message }
            }
          },
        }),
      }

    // Select tools based on mode
    const tools = mode === 'plan'
      ? readOnlyTools
      : { ...readOnlyTools, ...writeTools }

    const result = streamText({
      model,
      system: systemPrompt,
      messages: compaction.messages,
      stopWhen: stepCountIs(3),
      maxOutputTokens: 2048,
      tools,
      onFinish: async ({ totalUsage }) => {
        // Record token usage to database
        if (totalUsage) {
          const promptTokens = totalUsage.inputTokens ?? 0
          const completionTokens = totalUsage.outputTokens ?? 0
          await recordTokenUsage({
            entityType: 'asset',
            entityId: id,
            providerId: provider?.id ?? null,
            modelId: model.modelId ?? 'unknown',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            wasCompacted: compaction.wasCompacted,
          })
        }
      },
    })

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        if (part.type === 'start') {
          return {
            tokenUsage: {
              contextTokens: compaction.compactedTokens,
              wasCompacted: compaction.wasCompacted,
              compactionMessage: compaction.compactionMessage,
            },
          }
        }
        if (part.type === 'finish') {
          const promptTokens = part.totalUsage?.inputTokens ?? 0
          const completionTokens = part.totalUsage?.outputTokens ?? 0
          return {
            tokenUsage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            },
          }
        }
        return undefined
      },
    })
  })
})
