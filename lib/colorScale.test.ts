import { describe, expect, it } from 'vitest'
import { generateColorScale, hexToHSL, hslToHex } from './colorScale'

describe('hexToHSL', () => {
  it('converts pure red to HSL', () => {
    const [h, s, l] = hexToHSL('#ff0000')
    expect(h).toBe(0)
    expect(s).toBe(1)
    expect(l).toBe(0.5)
  })

  it('converts pure green to HSL', () => {
    const [h, s, l] = hexToHSL('#00ff00')
    expect(h).toBe(120)
    expect(s).toBe(1)
    expect(l).toBe(0.5)
  })

  it('converts pure blue to HSL', () => {
    const [h, s, l] = hexToHSL('#0000ff')
    expect(h).toBe(240)
    expect(s).toBe(1)
    expect(l).toBe(0.5)
  })

  it('converts white to HSL (zero saturation)', () => {
    const [h, s, l] = hexToHSL('#ffffff')
    expect(h).toBe(0)
    expect(s).toBe(0)
    expect(l).toBe(1)
  })

  it('converts black to HSL (zero saturation)', () => {
    const [h, s, l] = hexToHSL('#000000')
    expect(h).toBe(0)
    expect(s).toBe(0)
    expect(l).toBe(0)
  })

  it('converts gray to HSL (zero saturation)', () => {
    const [, s, l] = hexToHSL('#808080')
    expect(s).toBe(0)
    expect(l).toBeCloseTo(0.5, 2)
  })
})

describe('hslToHex', () => {
  it('converts HSL back to hex (red)', () => {
    const hex = hslToHex(0, 1, 0.5)
    expect(hex.toLowerCase()).toBe('#ff0000')
  })

  it('converts HSL back to hex (green)', () => {
    const hex = hslToHex(120, 1, 0.5)
    expect(hex.toLowerCase()).toBe('#00ff00')
  })

  it('converts HSL back to hex (blue)', () => {
    const hex = hslToHex(240, 1, 0.5)
    expect(hex.toLowerCase()).toBe('#0000ff')
  })

  it('handles white (zero saturation)', () => {
    const hex = hslToHex(0, 0, 1)
    expect(hex.toLowerCase()).toBe('#ffffff')
  })

  it('handles black (zero saturation)', () => {
    const hex = hslToHex(0, 0, 0)
    expect(hex.toLowerCase()).toBe('#000000')
  })
})

describe('generateColorScale', () => {
  it('generates a full 11-shade scale from a single hex color', () => {
    const scale = generateColorScale('#7458f5')
    
    expect(Object.keys(scale)).toHaveLength(11)
    expect(scale).toHaveProperty('50')
    expect(scale).toHaveProperty('100')
    expect(scale).toHaveProperty('200')
    expect(scale).toHaveProperty('300')
    expect(scale).toHaveProperty('400')
    expect(scale).toHaveProperty('500')
    expect(scale).toHaveProperty('600')
    expect(scale).toHaveProperty('700')
    expect(scale).toHaveProperty('800')
    expect(scale).toHaveProperty('900')
    expect(scale).toHaveProperty('950')
  })

  it('returns hex values for all shades', () => {
    const scale = generateColorScale('#7458f5')
    
    for (const shade of ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']) {
      expect(scale[shade]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('produces lighter shades for lower numbers', () => {
    const scale = generateColorScale('#7458f5')
    const [,, l50] = hexToHSL(scale['50']!)
    const [,, l900] = hexToHSL(scale['900']!)
    
    expect(l50).toBeGreaterThan(l900)
  })

  it('preserves hue across most shades', () => {
    const scale = generateColorScale('#7458f5')
    const baseHue = hexToHSL('#7458f5')[0]
    
    // Test shades from 100-900 (skip 50 and 950 which can have hue shifts in very light/dark)
    const shadesToTest = ['100', '200', '300', '400', '500', '600', '700', '800', '900']
    for (const shadeKey of shadesToTest) {
      const shade = scale[shadeKey]!
      const [h, s] = hexToHSL(shade)
      // Skip if saturation is very low (grayscale-appearing shades)
      if (s < 0.05) continue
      // Allow small rounding differences
      expect(Math.abs(h - baseHue)).toBeLessThanOrEqual(15)
    }
  })

  it('handles red input', () => {
    const scale = generateColorScale('#ff0000')
    expect(scale['500']!.toLowerCase()).toBe('#ff0000')
  })

  it('handles grayscale input', () => {
    const scale = generateColorScale('#808080')
    
    // All shades should have near-zero saturation
    for (const shade of Object.values(scale)) {
      const [, s] = hexToHSL(shade)
      expect(s).toBeLessThan(0.1)
    }
  })
})
