/**
 * Generate an 11-shade color scale (50–950) from a single hex color.
 *
 * The input hex is treated as the 500 shade. The algorithm:
 * 1. Extracts hue and saturation from the input color
 * 2. Maps each shade to a fixed target lightness (matching Tailwind's scale distribution)
 * 3. Aggressively desaturates lighter shades so they remain neutral/subtle
 * 4. Slightly boosts saturation for mid-dark shades (600-800) for vibrancy
 *
 * The desaturation curve is critical for contrast — light shades (50-200) need
 * to be nearly achromatic so they work as backgrounds, while dark shades
 * (800-950) need enough saturation to retain the color's character.
 */

// Re-export from lib/ for backward compatibility
export { generateColorScale } from '../../lib/colorScale'
