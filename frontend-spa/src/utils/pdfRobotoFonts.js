/**
 * Встраивает Roboto (TTF из /public/fonts) в jsPDF с Identity-H — корректная кириллица.
 * Шрифты: googlefonts/roboto-2 (Apache 2.0).
 */

export const PDF_BODY_FONT = 'Roboto'

function arrayBufferToBinaryString(buf) {
  const bytes = new Uint8Array(buf)
  const chunk = 8192
  let out = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length))
    out += String.fromCharCode.apply(null, sub)
  }
  return out
}

let loadPromise = null

/** @param {import('jspdf').default} pdf */
export async function attachRobotoFontsToPdf(pdf) {
  const base = import.meta.env.BASE_URL || '/'
  if (!loadPromise) {
    loadPromise = (async () => {
      const [rReg, rBold] = await Promise.all([
        fetch(`${base}fonts/Roboto-Regular.ttf`),
        fetch(`${base}fonts/Roboto-Bold.ttf`),
      ])
      if (!rReg.ok || !rBold.ok) {
        throw new Error('Не удалось загрузить шрифты Roboto для PDF')
      }
      return {
        regular: arrayBufferToBinaryString(await rReg.arrayBuffer()),
        bold: arrayBufferToBinaryString(await rBold.arrayBuffer()),
      }
    })()
  }
  const { regular, bold } = await loadPromise
  pdf.addFileToVFS('Roboto-Regular.ttf', regular)
  pdf.addFont('Roboto-Regular.ttf', PDF_BODY_FONT, 'normal', 'Identity-H')
  pdf.addFileToVFS('Roboto-Bold.ttf', bold)
  pdf.addFont('Roboto-Bold.ttf', PDF_BODY_FONT, 'bold', 'Identity-H')
}
