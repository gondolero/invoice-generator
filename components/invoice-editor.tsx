"use client"

import { useState, useRef, useCallback, useEffect, memo } from "react"
import { Button } from "@/components/ui/button"
import { 
  Plus, 
  Trash2, 
  Download, 
  Bold, 
  Italic, 
  Underline,
  Image as ImageIcon,
  X,
  PlusCircle
} from "lucide-react"

interface Cell {
  id: string
  content: string
  width: number
}

interface Row {
  id: string
  cells: Cell[]
}

interface InvoiceData {
  logo: string | null
  rows: Row[]
}

interface FloatingToolbarPosition {
  x: number
  y: number
  visible: boolean
}

const DEFAULT_CELL_WIDTH = 120

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

function parseNumericValue(text: string): number | null {
  // Remove HTML tags and get plain text
  const plainText = text.replace(/<[^>]*>/g, '').trim()
  // Remove commas and try to parse as number
  const cleaned = plainText.replace(/,/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function smartSum(cells: Cell[]): string {
  let sum = 0
  let hasNumbers = false
  
  for (const cell of cells) {
    const num = parseNumericValue(cell.content)
    if (num !== null) {
      sum += num
      hasNumbers = true
    }
  }
  
  return hasNumbers ? sum.toLocaleString() : ''
}

export function InvoiceEditor() {
  const [floatingToolbar, setFloatingToolbar] = useState<FloatingToolbarPosition>({
    x: 0,
    y: 0,
    visible: false
  })
  const [data, setData] = useState<InvoiceData>({
    logo: '/logo.jpg',
    rows: [
      {
        id: generateId(),
        cells: [
          { id: generateId(), content: 'Qty', width: 60 },
          { id: generateId(), content: 'Item #', width: 60 },
          { id: generateId(), content: 'Description', width: 200 },
          { id: generateId(), content: 'Unit Price', width: 100 },
          { id: generateId(), content: 'Discount', width: 80 },
          { id: generateId(), content: 'Line Total', width: 100 },
        ]
      },
      {
        id: generateId(),
        cells: [
          { id: generateId(), content: '1.00', width: 60 },
          { id: generateId(), content: '1', width: 60 },
          { id: generateId(), content: 'Sample Item', width: 200 },
          { id: generateId(), content: '1,000', width: 100 },
          { id: generateId(), content: '0', width: 80 },
          { id: generateId(), content: '1,000', width: 100 },
        ]
      }
    ]
  })

  const [isExporting, setIsExporting] = useState(false)
  const invoiceRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const maxColumns = Math.max(...data.rows.map(r => r.cells.length))

  // Show floating toolbar on mouseup when text is selected
  const checkSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0 && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      
      setFloatingToolbar({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
        visible: true
      })
    } else {
      setFloatingToolbar(prev => ({ ...prev, visible: false }))
    }
  }, [])

  useEffect(() => {
    const handleMouseUp = () => setTimeout(checkSelection, 0)
    const handleTouchEnd = () => setTimeout(checkSelection, 500)

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchend', handleTouchEnd)
    document.addEventListener('keyup', checkSelection)

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('keyup', checkSelection)
    }
  }, [checkSelection])

  const addRow = useCallback(() => {
    const newCells: Cell[] = Array(maxColumns).fill(null).map(() => ({
      id: generateId(),
      content: '',
      width: DEFAULT_CELL_WIDTH
    }))
    
    setData(prev => ({
      ...prev,
      rows: [...prev.rows, { id: generateId(), cells: newCells }]
    }))
  }, [maxColumns])

  const addColumnToRow = useCallback((rowId: string) => {
    setData(prev => ({
      ...prev,
      rows: prev.rows.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            cells: [...row.cells, { id: generateId(), content: '', width: DEFAULT_CELL_WIDTH }]
          }
        }
        return row
      })
    }))
  }, [])

  const deleteRow = useCallback((rowId: string) => {
    setData(prev => ({
      ...prev,
      rows: prev.rows.filter(row => row.id !== rowId)
    }))
  }, [])

  const deleteColumn = useCallback((colIndex: number) => {
    setData(prev => ({
      ...prev,
      rows: prev.rows.map(row => ({
        ...row,
        cells: row.cells.filter((_, idx) => idx !== colIndex)
      }))
    }))
  }, [])

  const updateCellContent = useCallback((rowId: string, cellId: string, content: string) => {
    setData(prev => ({
      ...prev,
      rows: prev.rows.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            cells: row.cells.map(cell => {
              if (cell.id === cellId) {
                return { ...cell, content }
              }
              return cell
            })
          }
        }
        return row
      })
    }))
  }, [])

  const updateCellWidth = useCallback((rowId: string, cellId: string, width: number) => {
    setData(prev => ({
      ...prev,
      rows: prev.rows.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            cells: row.cells.map(cell => {
              if (cell.id === cellId) {
                return { ...cell, width: Math.max(40, width) }
              }
              return cell
            })
          }
        }
        return row
      })
    }))
  }, [])

  const applyFormat = useCallback((command: string) => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) {
      document.execCommand(command, false)
      // Keep selection after formatting
      setFloatingToolbar(prev => ({ ...prev }))
    }
  }, [])

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setData(prev => ({
          ...prev,
          logo: event.target?.result as string
        }))
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const removeLogo = useCallback(() => {
    setData(prev => ({ ...prev, logo: null }))
  }, [])

  const exportToPDF = useCallback(async () => {
    if (!invoiceRef.current) return
    
    setIsExporting(true)
    
    try {
      const html2canvas = (await import('html2canvas')).default
      const jsPDF = (await import('jspdf')).default
      
      const element = invoiceRef.current
      
      // Create a clone for export to remove interactive elements
      const clone = element.cloneNode(true) as HTMLElement
      clone.style.position = 'absolute'
      clone.style.left = '-9999px'
      clone.style.top = '0'
      clone.style.width = element.scrollWidth + 'px'
      
      // Convert modern CSS colors (lab, oklch) to rgb for html2canvas compatibility
      // Use a canvas context to force color conversion to RGB
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = 1
      tempCanvas.height = 1
      const ctx = tempCanvas.getContext('2d')!

      const colorToRgb = (color: string): string => {
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
          return color
        }
        if (color.startsWith('rgb')) {
          return color
        }
        // Draw to canvas and read pixel data — works for lab(), oklch(), etc.
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = color
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
        return `rgb(${r}, ${g}, ${b})`
      }
      
      const convertColorsToRgb = (el: HTMLElement) => {
        const computed = window.getComputedStyle(el)
        
        try {
          const bgColor = colorToRgb(computed.backgroundColor)
          if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
            el.style.backgroundColor = bgColor
          }
        } catch (e) {
          el.style.backgroundColor = '#ffffff'
        }
        
        try {
          const textColor = colorToRgb(computed.color)
          if (textColor) {
            el.style.color = textColor
          }
        } catch (e) {
          el.style.color = '#000000'
        }
        
        try {
          const borderColor = colorToRgb(computed.borderColor)
          if (borderColor) {
            el.style.borderColor = borderColor
          }
        } catch (e) {
          el.style.borderColor = '#e5e5e5'
        }
        
        Array.from(el.children).forEach(child => {
          if (child instanceof HTMLElement) {
            convertColorsToRgb(child)
          }
        })
      }
      
      // Override CSS custom properties (oklch/lab) with RGB equivalents on the clone
      // html2canvas can't parse modern color functions, so we resolve vars at the root
      const rootComputed = window.getComputedStyle(document.documentElement)
      const cssVarNames = [
        '--background', '--foreground', '--card', '--card-foreground',
        '--popover', '--popover-foreground', '--primary', '--primary-foreground',
        '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
        '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
        '--border', '--input', '--ring',
        '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5',
        '--sidebar', '--sidebar-foreground', '--sidebar-primary',
        '--sidebar-primary-foreground', '--sidebar-accent', '--sidebar-accent-foreground',
        '--sidebar-border', '--sidebar-ring',
      ]
      cssVarNames.forEach(varName => {
        const value = rootComputed.getPropertyValue(varName).trim()
        if (value) {
          const converted = colorToRgb(value)
          if (converted) clone.style.setProperty(varName, converted)
        }
      })

      document.body.appendChild(clone)
      convertColorsToRgb(clone)
      
      // Remove add column buttons from clone
      clone.querySelectorAll('[data-export-hide]').forEach(el => el.remove())
      
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: element.scrollWidth,
        height: element.scrollHeight,
        onclone: (clonedDoc: Document) => {
          // Inject RGB overrides into html2canvas's internal document clone
          // so the @supports(color: lab(...)) block is overridden
          const styleEl = clonedDoc.createElement('style')
          const overrides = cssVarNames.map(varName => {
            const value = rootComputed.getPropertyValue(varName).trim()
            const converted = colorToRgb(value)
            return converted ? `${varName}: ${converted};` : ''
          }).filter(Boolean).join(' ')
          styleEl.textContent = `:root { ${overrides} } .dark { ${overrides} }`
          clonedDoc.head.appendChild(styleEl)
        },
      })
      
      document.body.removeChild(clone)
      
      const imgData = canvas.toDataURL('image/png')
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      
      // Calculate PDF dimensions (A4-ish but auto-height)
      const pdfWidth = 210 // A4 width in mm
      const pdfHeight = (imgHeight * pdfWidth) / imgWidth
      
      const pdf = new jsPDF({
        orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      })
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)

      const slugify = (text: string) =>
        text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

      const companyName = element.querySelector<HTMLElement>('.text-lg.font-bold')?.textContent?.trim() ?? ''
      const invoiceNumLabel = Array.from(element.querySelectorAll<HTMLElement>('span')).find(s => s.textContent?.trim() === 'Invoice #:')
      const invoiceNum = invoiceNumLabel?.parentElement?.querySelector<HTMLElement>('[contenteditable]')?.textContent?.trim() ?? ''

      const parts = [slugify(companyName), slugify(invoiceNum)].filter(p => p && p !== '-')
      const filename = (parts.length ? parts.join('-') : 'invoice') + '.pdf'

      pdf.save(filename)
    } catch (error) {
      console.error('Error exporting PDF:', error)
    } finally {
      setIsExporting(false)
    }
  }, [])

  // Calculate sum for a column
  const getColumnSum = useCallback((colIndex: number): string => {
    const cells = data.rows.slice(1).map(row => row.cells[colIndex]).filter(Boolean)
    return smartSum(cells)
  }, [data.rows])

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Floating Toolbar - appears on text selection */}
      {floatingToolbar.visible && (
        <div 
          data-floating-toolbar
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg p-1 flex items-center gap-0.5 animate-in fade-in-0 zoom-in-95"
          style={{
            left: `${floatingToolbar.x}px`,
            top: `${floatingToolbar.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              applyFormat('bold')
            }}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-foreground"
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              applyFormat('italic')
            }}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-foreground"
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              applyFormat('underline')
            }}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-foreground"
            title="Underline"
          >
            <Underline className="h-4 w-4" />
          </button>
        </div>
      )}
      
      {/* Top bar with Export */}
      <div className="sticky top-0 z-20 bg-card border-b border-border p-2 flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleLogoUpload}
          className="hidden"
        />
        
        <div className="flex-1" />
        
        <Button
          onClick={exportToPDF}
          disabled={isExporting}
          size="sm"
          className="h-8 gap-1.5"
        >
          <Download className="h-4 w-4" />
          <span>{isExporting ? 'Exporting...' : 'Export PDF'}</span>
        </Button>
      </div>
      
      {/* Editor area - scrollable */}
      <div 
        ref={editorContainerRef}
        className="flex-1 overflow-auto p-4"
      >
        <div 
          ref={invoiceRef} 
          className="bg-card min-w-max inline-block p-6 rounded-lg shadow-sm border border-border"
        >
          {/* Company Header */}
          <div className="mb-6 flex justify-between items-start">
            <div>
              {data.logo ? (
                <div className="relative inline-block">
                  <img 
                    src={data.logo} 
                    alt="Logo" 
                    className="max-h-20 object-contain"
                  />
                  <button
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                    data-export-hide
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div 
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-muted-foreground text-sm cursor-pointer hover:border-muted-foreground/50 transition-colors inline-block"
                  onClick={() => fileInputRef.current?.click()}
                  data-export-hide
                >
                  Click to add logo
                </div>
              )}
              <div
                contentEditable
                suppressContentEditableWarning
                className="mt-2 text-lg font-bold p-1 border border-transparent hover:border-border rounded focus:border-primary focus:outline-none"
              >
                CCTV Camera Installation
              </div>
              <div
                contentEditable
                suppressContentEditableWarning
                className="text-sm text-muted-foreground p-1 border border-transparent hover:border-border rounded focus:border-primary focus:outline-none"
              >
                Ali Akbar | cctvcamera.net.pk
              </div>
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              className="text-2xl font-bold text-right p-1 border border-transparent hover:border-border rounded focus:border-primary focus:outline-none"
            >
              Quotation
            </div>
          </div>
          
          {/* Client info area - editable */}
          <div className="mb-6 grid grid-cols-2 gap-x-8 gap-y-2 max-w-2xl">
            <EditableField label="To:" defaultValue="Client Name" />
            <EditableField label="Date:" defaultValue={new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} />
            <EditableField label="Address:" defaultValue="Address" />
            <EditableField label="Email:" defaultValue="-" />
            <EditableField label="Tel:" defaultValue="-" />
            <EditableField label="Invoice #:" defaultValue="-" />
          </div>
          
          {/* Quotation For */}
          <div className="mb-4">
            <EditableField label="Quotation For:" defaultValue="Description of work/items" />
          </div>
          
          {/* Table */}
          <div className="relative">
            <table className="border-collapse">
              <tbody>
                {/* Delete column controls row */}
                {maxColumns > 1 && (
                  <tr className="group" data-export-hide>
                    {Array.from({ length: maxColumns }, (_, colIndex) => (
                      <td key={colIndex} className="border-0 p-0 text-center">
                        <button
                          onClick={() => deleteColumn(colIndex)}
                          className="mb-1 p-1 text-muted-foreground hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          title="Delete column"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    ))}
                    <td className="border-0 p-0" />
                    <td className="border-0 p-0" />
                  </tr>
                )}
                {data.rows.map((row, rowIndex) => (
                  <tr key={row.id} className="group">
                    {row.cells.map((cell, cellIndex) => (
                      <td
                        key={cell.id}
                        className="border border-border p-0 relative"
                        style={{ minWidth: cell.width, maxWidth: cell.width }}
                      >
<EditableCell
                          key={`${row.id}-${cell.id}`}
                          content={cell.content}
                          isHeader={rowIndex === 0}
                          onBlur={(html) => updateCellContent(row.id, cell.id, html)}
                        />
                        {/* Column resize handle */}
                        <div
                          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            const startX = e.clientX
                            const startWidth = cell.width
                            
                            const handleMouseMove = (moveE: MouseEvent) => {
                              const diff = moveE.clientX - startX
                              updateCellWidth(row.id, cell.id, startWidth + diff)
                            }
                            
                            const handleMouseUp = () => {
                              document.removeEventListener('mousemove', handleMouseMove)
                              document.removeEventListener('mouseup', handleMouseUp)
                            }
                            
                            document.addEventListener('mousemove', handleMouseMove)
                            document.addEventListener('mouseup', handleMouseUp)
                          }}
                        />
                      </td>
                    ))}
                    {/* Add column button */}
                    <td className="border-0 p-0 align-middle" data-export-hide>
                      <button
                        onClick={() => addColumnToRow(row.id)}
                        className="ml-1 p-1 text-muted-foreground hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        title="Add column"
                      >
                        <PlusCircle className="h-4 w-4" />
                      </button>
                    </td>
                    {/* Delete row button */}
                    <td className="border-0 p-0 align-middle" data-export-hide>
                      {data.rows.length > 1 && (
                        <button
                          onClick={() => deleteRow(row.id)}
                          className="ml-1 p-1 text-muted-foreground hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          title="Delete row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Add row button - bottom left */}
            <div className="mt-2" data-export-hide>
              <Button
                variant="outline"
                size="sm"
                onClick={addRow}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add Row
              </Button>
            </div>
          </div>
          
          {/* Totals section */}
          <TotalsSection subtotal={getColumnSum(data.rows[0]?.cells.length - 1 || 0)} />
          
          {/* Terms & Conditions */}
          <div className="mt-6 pt-4 border-t border-border">
            <div className="text-sm font-semibold mb-2">Terms & Conditions:</div>
            <div
              contentEditable
              suppressContentEditableWarning
              className="text-sm text-muted-foreground p-2 border border-transparent hover:border-border rounded focus:border-primary focus:outline-none min-h-[80px] whitespace-pre-wrap"
            >
{`Payment: Cash Only
Service: Three month free service, will resolve complaints free of cost.
Warranty: One year equipment warranty. (Power supply and accessories not included)
Note: Any type of civil & carpenter work will not be in our scope.`}
            </div>
          </div>
          
          {/* Signature Line */}
          <div className="mt-6 text-sm">
            <span>To accept this quotation, sign here and return: </span>
            <span className="inline-block border-b border-foreground min-w-[200px]">&nbsp;</span>
          </div>
          
          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-border text-center text-sm text-muted-foreground">
            <div
              contentEditable
              suppressContentEditableWarning
              className="p-1 border border-transparent hover:border-border rounded focus:border-primary focus:outline-none"
            >
              Thank you for your business!
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              className="mt-1 p-1 border border-transparent hover:border-border rounded focus:border-primary focus:outline-none"
            >
              Old Golimar, Rexer, Karachi. cctvcamera.net.pk
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Memoized component to prevent re-renders from interrupting text selection
const EditableCell = memo(function EditableCell({ 
  content, 
  isHeader, 
  onBlur 
}: { 
  content: string
  isHeader: boolean
  onBlur: (html: string) => void 
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Set initial content only once on mount
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = content
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className={`
        p-2 min-h-[40px] outline-none whitespace-pre-wrap break-words
        ${isHeader ? 'bg-muted font-semibold text-sm' : 'text-sm'}
        focus:bg-accent/50
      `}
      onBlur={(e) => onBlur(e.currentTarget.innerHTML)}
    />
  )
})

function EditableField({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <div
        contentEditable
        suppressContentEditableWarning
        className="text-sm p-1 border border-transparent hover:border-border rounded focus:border-primary focus:outline-none whitespace-pre-wrap"
      >
        {defaultValue}
      </div>
    </div>
  )
}

function TotalsSection({ subtotal }: { subtotal: string }) {
  const [taxPercent, setTaxPercent] = useState(0)
  const [discount, setDiscount] = useState(0)
  
  const subtotalNum = parseFloat(subtotal.replace(/,/g, '')) || 0
  const discountAmount = discount
  const taxableAmount = subtotalNum - discountAmount
  const taxAmount = (taxableAmount * taxPercent) / 100
  const total = taxableAmount + taxAmount
  
  return (
    <div className="mt-6 flex justify-end">
      <div className="w-72">
        <div className="flex justify-between py-2 text-sm">
          <span>Subtotal:</span>
          <span>{subtotal || '0'}</span>
        </div>
        <div className="flex justify-between py-2 text-sm">
          <span>Total Discount:</span>
          <div
            contentEditable
            suppressContentEditableWarning
            className="text-right min-w-[80px] p-1 border border-transparent hover:border-border rounded focus:border-primary focus:outline-none"
            onBlur={(e) => {
              const val = parseFloat(e.currentTarget.textContent?.replace(/,/g, '') || '0') || 0
              setDiscount(val)
            }}
          >
            0
          </div>
        </div>
        <div className="flex justify-between py-2 text-sm">
          <span>Tax %:</span>
          <div
            contentEditable
            suppressContentEditableWarning
            className="text-right min-w-[60px] p-1 border border-transparent hover:border-border rounded focus:border-primary focus:outline-none"
            onBlur={(e) => {
              const val = parseFloat(e.currentTarget.textContent || '0') || 0
              setTaxPercent(val)
            }}
          >
            0
          </div>
        </div>
        <div className="flex justify-between py-2 text-sm text-muted-foreground">
          <span>Tax Amount:</span>
          <span>{taxAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between py-2 font-bold text-lg border-t-2 border-foreground">
          <span>Total:</span>
          <span>PKR {total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}
