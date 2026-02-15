import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import JSZip from 'jszip'

export interface ExtractionResult {
  text: string
  error?: string
}

/**
 * Extracts plain text from a file buffer based on its source type.
 */
export async function extractText(
  buffer: Buffer,
  sourceType: string,
): Promise<ExtractionResult> {
  switch (sourceType) {
    case 'txt':
    case 'text':
      return { text: buffer.toString('utf-8') }
    case 'pdf':
      return extractPdf(buffer)
    case 'docx':
      return extractDocx(buffer)
    case 'pptx':
      return extractPptx(buffer)
    default:
      return { text: '', error: `Unsupported file type: ${sourceType}` }
  }
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const pdf = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await pdf.getText()
    await pdf.destroy()
    return { text: result.text }
  }
  catch (err) {
    return { text: '', error: `PDF extraction failed: ${(err as Error).message}` }
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return { text: result.value }
  }
  catch (err) {
    return { text: '', error: `DOCX extraction failed: ${(err as Error).message}` }
  }
}

/**
 * Extracts text from PPTX files by unzipping and parsing the XML slide files.
 * PPTX is a ZIP archive containing XML files for each slide.
 */
async function extractPptx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const slideTexts: string[] = []

    // Slides are in ppt/slides/slide1.xml, slide2.xml, etc.
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = Number.parseInt(a.match(/slide(\d+)/)?.[1] ?? '0')
        const numB = Number.parseInt(b.match(/slide(\d+)/)?.[1] ?? '0')
        return numA - numB
      })

    for (const slidePath of slideFiles) {
      const xml = await zip.files[slidePath]!.async('string')
      // Extract text from <a:t> tags (DrawingML text elements)
      const texts = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g)
      if (texts) {
        const slideText = texts
          .map(t => t.replace(/<[^>]+>/g, ''))
          .join(' ')
        slideTexts.push(slideText)
      }
    }

    return { text: slideTexts.join('\n\n') }
  }
  catch (err) {
    return { text: '', error: `PPTX extraction failed: ${(err as Error).message}` }
  }
}
