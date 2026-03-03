import { useCallback, useState } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export function useStatisticsPDF() {
  const [isGenerating, setIsGenerating] = useState(false)

  const generatePDF = useCallback(async (elementRef, filename) => {
    if (!elementRef.current) return
    setIsGenerating(true)
    try {
      const canvas = await html2canvas(elementRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgHeight = (canvas.height * pageWidth) / canvas.width

      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight)
        heightLeft -= pageHeight
      }

      pdf.save(filename || 'statistics.pdf')
    } finally {
      setIsGenerating(false)
    }
  }, [])

  return { generatePDF, isGenerating }
}

