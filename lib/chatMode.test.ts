import { describe, expect, it } from 'vitest'
import { getInitialChatMode, type ChatMode } from './chatMode'

describe('getInitialChatMode', () => {
  it('returns "plan" when chat has no messages (new chat)', () => {
    const mode = getInitialChatMode(false)
    expect(mode).toBe('plan')
  })

  it('returns "build" when chat has messages (existing chat)', () => {
    const mode = getInitialChatMode(true)
    expect(mode).toBe('build')
  })

  it('returns correct type for ChatMode', () => {
    const mode: ChatMode = getInitialChatMode(false)
    expect(mode).toSatisfy((m: ChatMode) => m === 'plan' || m === 'build')
  })
})
