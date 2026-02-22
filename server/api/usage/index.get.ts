import { eq, sql, and, gte, desc, type SQL } from 'drizzle-orm'
import { tokenUsage, aiProviders, aiModels } from '~~/server/database/schema'

/**
 * GET /api/usage
 *
 * Returns aggregated token usage statistics grouped by provider and model.
 * Supports optional filtering by date range.
 *
 * Query params:
 *   - since: ISO date string to filter usage from (inclusive)
 *   - entityType: Filter by entity type (template, activity, document, asset)
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const since = query.since ? new Date(query.since as string) : null
  const entityType = query.entityType as string | undefined

  const db = useDb()

  // Build conditions array
  const conditions: SQL<unknown>[] = []
  if (since) {
    conditions.push(gte(tokenUsage.createdAt, since))
  }
  if (entityType) {
    conditions.push(eq(tokenUsage.entityType, entityType as 'template' | 'activity' | 'document' | 'asset'))
  }

  // Get usage aggregated by provider and model
  const usageByModel = db
    .select({
      providerId: tokenUsage.providerId,
      modelId: tokenUsage.modelId,
      totalPromptTokens: sql<number>`sum(${tokenUsage.promptTokens})`,
      totalCompletionTokens: sql<number>`sum(${tokenUsage.completionTokens})`,
      totalTokens: sql<number>`sum(${tokenUsage.totalTokens})`,
      requestCount: sql<number>`count(*)`,
      compactedCount: sql<number>`sum(case when ${tokenUsage.wasCompacted} then 1 else 0 end)`,
    })
    .from(tokenUsage)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(tokenUsage.providerId, tokenUsage.modelId)
    .all()

  // Get provider names for display
  const providerIds = [...new Set(usageByModel.map(u => u.providerId).filter(Boolean))]
  const providers = providerIds.length > 0
    ? db.select({ id: aiProviders.id, name: aiProviders.name, type: aiProviders.type })
        .from(aiProviders)
        .where(sql`${aiProviders.id} IN (${sql.join(providerIds.map(id => sql`${id}`), sql`, `)})`)
        .all()
    : []

  const providerMap = new Map(providers.map(p => [p.id, p]))

  // Get model names for display (for models we have in the database)
  const modelIds = [...new Set(usageByModel.map(u => u.modelId))]
  const models = modelIds.length > 0
    ? db.select({ modelId: aiModels.modelId, name: aiModels.name })
        .from(aiModels)
        .where(sql`${aiModels.modelId} IN (${sql.join(modelIds.map(id => sql`${id}`), sql`, `)})`)
        .all()
    : []

  const modelMap = new Map(models.map(m => [m.modelId, m.name]))

  // Compute totals
  const totals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requestCount: 0,
    compactedCount: 0,
  }

  const usage = usageByModel.map((row) => {
    totals.promptTokens += row.totalPromptTokens
    totals.completionTokens += row.totalCompletionTokens
    totals.totalTokens += row.totalTokens
    totals.requestCount += row.requestCount
    totals.compactedCount += row.compactedCount

    const provider = row.providerId ? providerMap.get(row.providerId) : null

    return {
      providerId: row.providerId,
      providerName: provider?.name ?? 'Unknown',
      providerType: provider?.type ?? 'unknown',
      modelId: row.modelId,
      modelName: modelMap.get(row.modelId) ?? row.modelId,
      promptTokens: row.totalPromptTokens,
      completionTokens: row.totalCompletionTokens,
      totalTokens: row.totalTokens,
      requestCount: row.requestCount,
      compactedCount: row.compactedCount,
    }
  })

  // Get recent usage records for timeline (last 30 days, grouped by day)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const dailyUsage = db
    .select({
      date: sql<string>`date(${tokenUsage.createdAt} / 1000, 'unixepoch')`,
      totalTokens: sql<number>`sum(${tokenUsage.totalTokens})`,
      requestCount: sql<number>`count(*)`,
    })
    .from(tokenUsage)
    .where(gte(tokenUsage.createdAt, thirtyDaysAgo))
    .groupBy(sql`date(${tokenUsage.createdAt} / 1000, 'unixepoch')`)
    .orderBy(desc(sql`date(${tokenUsage.createdAt} / 1000, 'unixepoch')`))
    .all()

  return {
    usage,
    totals,
    dailyUsage,
    filters: {
      since: since?.toISOString() ?? null,
      entityType: entityType ?? null,
    },
  }
})
