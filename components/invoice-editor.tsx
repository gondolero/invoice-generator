"use client"

import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Plus,
  Trash2,
  Download,
  Bold,
  Italic,
  Underline,
  Image as ImageIcon,
  X,
  PlusCircle,
  ChevronDown,
  Sigma,
} from "lucide-react"
import { evaluateFormula, getFormulaReferences } from "@/lib/formula"

interface Cell {
  id: string
  content: string
  width: number
}

interface Row {
  id: string
  cells: Cell[]
}

interface ColumnConfig {
  id: string
  formula: string | null
  showSum: boolean
}

interface InvoiceData {
  logo: string | null
  rows: Row[]
  columns: ColumnConfig[]
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

function getHeaderName(cell: Cell): string {
  return cell.content.replace(/<[^>]*>/g, '').trim()
}

function makeDefaultColumns(headerRow: Row): ColumnConfig[] {
  return headerRow.cells.map((_, i) => ({
    id: generateId(),
    formula: null,
    showSum: i === headerRow.cells.length - 1, // last column shows sum by default
  }))
}

export function InvoiceEditor() {
  const [data, setData] = useState<InvoiceData>(() => {
    const headerRow: Row = {
      id: generateId(),
      cells: [
        { id: generateId(), content: 'Qty', width: 60 },
        { id: generateId(), content: 'Item #', width: 60 },
        { id: generateId(), content: 'Description', width: 200 },
        { id: generateId(), content: 'Unit Price', width: 100 },
        { id: generateId(), content: 'Discount', width: 80 },
        { id: generateId(), content: 'Total', width: 100 },
      ]
    }
    return {
      logo: '/logo.jpg',
      rows: [
        headerRow,
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
      ],
      columns: makeDefaultColumns(headerRow),
    }
  })
  const [formulaDialog, setFormulaDialog] = useState<{ colIndex: number; draft: string } | null>(null)

  const [isExporting, setIsExporting] = useState(false)
  const [isSaved, setIsSaved] = useState<false | 'manual' | 'auto'>(false)
  const [floatingToolbar, setFloatingToolbar] = useState<{ x: number; y: number; visible: boolean; below?: boolean }>({ x: 0, y: 0, visible: false })
  const invoiceRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const pendingFieldsRef = useRef<string[] | null>(null)
  const isLoadingRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxColumns = Math.max(...data.rows.map(r => r.cells.length))

  // Compute header names for formula evaluation
  const headerNames = useMemo(() => {
    const hdr = data.rows[0]
    return hdr ? hdr.cells.map(c => getHeaderName(c)) : []
  }, [data.rows])

  // Compute all formula cell values
  const calculatedValues = useMemo(() => {
    const hdr = data.rows[0]
    if (!hdr) return new Map<string, Map<number, string>>()

    // Find which columns have formulas and their dependency order
    const formulaCols = data.columns
      .map((col, i) => ({ ...col, index: i }))
      .filter(c => c.formula)

    const result = new Map<string, Map<number, string>>()
    for (const row of data.rows.slice(1)) {
      const vars: Record<string, number> = {}
      // First pass: populate variables from non-formula columns
      hdr.cells.forEach((hdrCell, i) => {
        const name = getHeaderName(hdrCell)
        if (!data.columns[i]?.formula && row.cells[i]) {
          vars[name] = parseNumericValue(row.cells[i].content) ?? 0
        }
      })
      // Second pass: evaluate formula columns (handles one level of dependency)
      const rowMap = new Map<number, string>()
      for (const fc of formulaCols) {
        const val = evaluateFormula(fc.formula!, vars, headerNames)
        const name = getHeaderName(hdr.cells[fc.index])
        if (val !== null) {
          vars[name] = val
          rowMap.set(fc.index, val.toLocaleString())
        } else {
          rowMap.set(fc.index, '')
        }
      }
      result.set(row.id, rowMap)
    }
    return result
  }, [data.rows, data.columns, headerNames])

  // Restore saved contenteditable fields after render
  useEffect(() => {
    if (!pendingFieldsRef.current || !invoiceRef.current) return
    const els = Array.from(invoiceRef.current.querySelectorAll<HTMLElement>('[contenteditable]'))
    pendingFieldsRef.current.forEach((html, i) => { if (els[i]) els[i].innerHTML = html })
    pendingFieldsRef.current = null
    isLoadingRef.current = false
  })

  // Load saved draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('invoice_draft')
      if (!saved) return
      const { tableData, fields } = JSON.parse(saved)
      const savedLogoStr = localStorage.getItem('invoice_logo')
      isLoadingRef.current = true
      wasLoadingRef.current = true
      pendingFieldsRef.current = fields
      setData(prev => {
        const merged = {
          ...tableData,
          logo: savedLogoStr !== null ? JSON.parse(savedLogoStr) : prev.logo,
        }
        // Migration: generate columns if saved data lacks them
        if (!merged.columns && merged.rows?.[0]) {
          merged.columns = makeDefaultColumns(merged.rows[0])
        }
        return merged
      })
    } catch {}
  }, [])

  const saveDraft = useCallback((auto = false) => {
    if (!invoiceRef.current) return
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    const fields = Array.from(invoiceRef.current.querySelectorAll<HTMLElement>('[contenteditable]'))
      .map(el => el.innerHTML)
    const { logo, ...rowsOnly } = data
    try {
      localStorage.setItem('invoice_draft', JSON.stringify({ tableData: rowsOnly, fields }))
      if (!auto) localStorage.setItem('invoice_logo', JSON.stringify(logo))
    } catch {}
    setIsSaved(auto ? 'auto' : 'manual')
  }, [data])

  const scheduleAutoSave = useCallback(() => {
    if (isLoadingRef.current) return
    setIsSaved(false)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => saveDraft(true), 5000)
  }, [saveDraft])

  const hasMountedRef = useRef(false)
  const wasLoadingRef = useRef(false)
  const prevLogoRef = useRef(data.logo)

  // Auto-save on table data changes (skip initial mount, draft load, and logo-only changes)
  useEffect(() => {
    if (!hasMountedRef.current) { hasMountedRef.current = true; return }
    if (wasLoadingRef.current) { wasLoadingRef.current = false; return }
    // Logo changed — don't auto-save (logo is only saved on manual Save)
    if (data.logo !== prevLogoRef.current) { prevLogoRef.current = data.logo; return }
    scheduleAutoSave()
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save on contenteditable input
  useEffect(() => {
    const el = invoiceRef.current
    if (!el) return
    el.addEventListener('input', scheduleAutoSave)
    return () => el.removeEventListener('input', scheduleAutoSave)
  }, [scheduleAutoSave])

  const checkSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0 && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const isTouchDevice = window.matchMedia('(hover: none)').matches
      setFloatingToolbar({ x: rect.left + rect.width / 2, y: isTouchDevice ? rect.bottom + 10 : rect.top - 10, visible: true, below: isTouchDevice })
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

  const addColumn = useCallback(() => {
    setData(prev => ({
      ...prev,
      rows: prev.rows.map(row => ({
        ...row,
        cells: [...row.cells, { id: generateId(), content: '', width: DEFAULT_CELL_WIDTH }]
      })),
      columns: [...prev.columns, { id: generateId(), formula: null, showSum: false }],
    }))
  }, [])

  const deleteRow = useCallback((rowId: string) => {
    setData(prev => ({
      ...prev,
      rows: prev.rows.filter(row => row.id !== rowId)
    }))
  }, [])

  const deleteColumn = useCallback((colIndex: number) => {
    setData(prev => {
      const deletedName = getHeaderName(prev.rows[0]?.cells[colIndex])
      return {
        ...prev,
        rows: prev.rows.map(row => ({
          ...row,
          cells: row.cells.filter((_, idx) => idx !== colIndex)
        })),
        columns: prev.columns.filter((_, idx) => idx !== colIndex).map(col => {
          // Remove references to the deleted column from formulas
          if (!col.formula || !deletedName) return col
          const refs = getFormulaReferences(col.formula, [deletedName])
          if (refs.length === 0) return col
          // Clear formula if it references the deleted column
          return { ...col, formula: null }
        }),
      }
    })
  }, [])

  const updateCellContent = useCallback((rowId: string, cellId: string, content: string) => {
    setData(prev => {
      const isHeaderRow = prev.rows[0]?.id === rowId
      let newColumns = prev.columns

      // If editing a header cell, propagate rename to formulas
      if (isHeaderRow) {
        const cellIndex = prev.rows[0].cells.findIndex(c => c.id === cellId)
        if (cellIndex >= 0) {
          const oldName = getHeaderName(prev.rows[0].cells[cellIndex])
          const newName = content.replace(/<[^>]*>/g, '').trim()
          if (oldName && newName && oldName !== newName) {
            newColumns = prev.columns.map(col => {
              if (!col.formula) return col
              // Replace old name with new name in formula (case-insensitive)
              const regex = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
              return { ...col, formula: col.formula.replace(regex, newName) }
            })
          }
        }
      }

      return {
        ...prev,
        columns: newColumns,
        rows: prev.rows.map(row => {
          if (row.id === rowId) {
            return { ...row, cells: row.cells.map(cell => cell.id === cellId ? { ...cell, content } : cell) }
          }
          return row
        })
      }
    })
  }, [])

  const updateCellWidth = useCallback((rowId: string, cellId: string, width: number) => {
    setData(prev => ({
      ...prev,
      rows: prev.rows.map(row => {
        if (row.id === rowId) {
          return { ...row, cells: row.cells.map(cell => cell.id === cellId ? { ...cell, width: Math.max(40, width) } : cell) }
        }
        return row
      })
    }))
  }, [])

  const setColumnFormula = useCallback((colIndex: number, formula: string | null) => {
    setData(prev => ({
      ...prev,
      columns: prev.columns.map((col, i) => i === colIndex ? { ...col, formula } : col),
    }))
  }, [])

  const toggleColumnSum = useCallback((colIndex: number) => {
    setData(prev => ({
      ...prev,
      columns: prev.columns.map((col, i) => i === colIndex ? { ...col, showSum: !col.showSum } : col),
    }))
  }, [])

  const applyFormat = useCallback((command: string, value?: string) => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) {
      document.execCommand(command, false, value)
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

  // Calculate sum for a column (uses computed values for formula columns)
  const getColumnSum = useCallback((colIndex: number): string => {
    const isFormula = data.columns[colIndex]?.formula
    if (isFormula) {
      let sum = 0
      let hasNumbers = false
      for (const row of data.rows.slice(1)) {
        const val = calculatedValues.get(row.id)?.get(colIndex)
        if (val) {
          const num = parseFloat(val.replace(/,/g, ''))
          if (!isNaN(num)) { sum += num; hasNumbers = true }
        }
      }
      return hasNumbers ? sum.toLocaleString() : ''
    }
    const cells = data.rows.slice(1).map(row => row.cells[colIndex]).filter(Boolean)
    return smartSum(cells)
  }, [data.rows, data.columns, calculatedValues])

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Floating toolbar on text selection */}
      {floatingToolbar.visible && (
        <div
          data-floating-toolbar
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg p-1 flex items-center gap-0.5 animate-in fade-in-0 zoom-in-95"
          style={{ left: `${floatingToolbar.x}px`, top: `${floatingToolbar.y}px`, transform: floatingToolbar.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button onMouseDown={(e) => { e.preventDefault(); applyFormat('bold') }} className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-foreground" title="Bold"><Bold className="h-4 w-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); applyFormat('italic') }} className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-foreground" title="Italic"><Italic className="h-4 w-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); applyFormat('underline') }} className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-foreground" title="Underline"><Underline className="h-4 w-4" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); applyFormat('foreColor', '#ef4444') }} className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent" title="Red text"><span className="h-4 w-4 rounded-sm bg-red-500 inline-block" /></button>
        </div>
      )}

      {/* Scrollable area — toolbar + editor share same scroll context */}
      <div className="flex-1 overflow-y-auto bg-gray-100">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-card border-b border-border">
          <div className="max-w-[1080px] mx-auto py-2 flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />

            <button
              onMouseDown={(e) => { e.preventDefault(); applyFormat('bold') }}
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-foreground"
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); applyFormat('italic') }}
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-foreground"
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); applyFormat('underline') }}
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent text-foreground"
              title="Underline"
            >
              <Underline className="h-4 w-4" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); applyFormat('foreColor', '#ef4444') }}
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-accent"
              title="Red text"
            >
              <span className="h-4 w-4 rounded-sm bg-red-500 inline-block" />
            </button>

            <div className="flex-1" />

            <Button
              onClick={() => saveDraft()}
              variant="outline"
              size="sm"
              className={`h-9 gap-1.5 transition-colors ${isSaved === 'manual' ? 'bg-green-100 text-green-700 hover:bg-green-100 border-green-200' : isSaved === 'auto' ? 'bg-gray-100 text-gray-500 hover:bg-gray-100 border-gray-200' : ''}`}
            >
              {isSaved === 'manual' ? 'Saved' : isSaved === 'auto' ? 'Auto-saved' : 'Save'}
            </Button>

            <Button
              onClick={exportToPDF}
              disabled={isExporting}
              size="sm"
              className="h-9 gap-1.5"
            >
              <Download className="h-4 w-4" />
              <span>{isExporting ? 'Exporting...' : 'Export PDF'}</span>
            </Button>
          </div>
        </div>
        <div
          ref={editorContainerRef}
          className="w-full max-w-[1080px] mx-auto py-4"
        >

        <div
          ref={invoiceRef}
          className="bg-card p-6 rounded-lg border border-border"
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
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm hover:bg-red-600 transition-colors"
                    title="Remove logo"
                    data-export-hide
                  >
                    <X className="h-3 w-3 stroke-[3]" />
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
                Netera Communications
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
            <EditableField label="Address:" defaultValue="Old Golimar, Rexer, near Toll Plaza" />
            <EditableField label="Email:" defaultValue="aliakbarbalochea@gmail.com" />
            <EditableField label="Tel:" defaultValue="03223115011" />
            <EditableField label="Invoice #:" defaultValue="-" />
          </div>
          
          {/* Quotation For */}
          <div className="mb-4">
            <EditableField label="Quotation For:" defaultValue="Description of work/items" />
          </div>
          
          {/* Table */}
          <div className="relative overflow-x-auto">
            <table className="border-collapse min-w-max">
              <tbody>
                {/* Delete column controls row */}
                {maxColumns > 1 && (
                  <tr className="group" data-export-hide>
                    {Array.from({ length: maxColumns }, (_, colIndex) => (
                      <td key={colIndex} className="border-0 p-0 text-left">
                        <button
                          onClick={() => deleteColumn(colIndex)}
                          className="mb-1 p-1 text-muted-foreground hover:text-destructive transition-colors"
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
                    {row.cells.map((cell, cellIndex) => {
                      const isHeader = rowIndex === 0
                      const isFormula = !isHeader && data.columns[cellIndex]?.formula
                      return (
                        <td
                          key={cell.id}
                          className="border border-border p-0 relative"
                          style={{ minWidth: cell.width, maxWidth: cell.width }}
                        >
                          {isHeader ? (
                            <div className="flex items-center bg-muted">
                              <EditableCell
                                key={`${row.id}-${cell.id}`}
                                content={cell.content}
                                isHeader
                                onBlur={(html) => updateCellContent(row.id, cell.id, html)}
                              />
                              {data.columns[cellIndex]?.showSum && (
                                <Sigma className="h-3 w-3 shrink-0 text-muted-foreground" data-export-hide />
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
                                    data-export-hide
                                  >
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="shadow-none">
                                  <DropdownMenuItem onSelect={() => setFormulaDialog({ colIndex: cellIndex, draft: data.columns[cellIndex]?.formula ?? '' })}>
                                    Set formula...
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => toggleColumnSum(cellIndex)}>
                                    {data.columns[cellIndex]?.showSum ? 'Remove column sum' : 'Show column sum'}
                                  </DropdownMenuItem>
                                  {data.columns[cellIndex]?.formula && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="text-destructive" onSelect={() => setColumnFormula(cellIndex, null)}>
                                        Clear formula
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ) : isFormula ? (
                            <ComputedCell value={calculatedValues.get(row.id)?.get(cellIndex) ?? ''} />
                          ) : (
                            <EditableCell
                              key={`${row.id}-${cell.id}`}
                              content={cell.content}
                              isHeader={false}
                              onBlur={(html) => updateCellContent(row.id, cell.id, html)}
                            />
                          )}
                          {/* Column resize handle */}
                          <div
                            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              const startX = e.clientX
                              const startWidth = cell.width
                              const handleMouseMove = (moveE: MouseEvent) => {
                                updateCellWidth(row.id, cell.id, startWidth + (moveE.clientX - startX))
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
                      )
                    })}
                    {/* Add column button */}
                    <td className="border-0 p-0 align-middle" data-export-hide>
                      <button
                        onClick={addColumn}
                        className="ml-1 p-1 text-muted-foreground hover:text-foreground transition-colors"
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
                          className="ml-1 p-1 text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Sum row */}
                {data.columns.some(c => c.showSum) && (
                  <tr className="border-t-2 border-foreground">
                    {data.rows[0]?.cells.map((cell, colIndex) => (
                      <td key={cell.id} className="border border-border p-2 font-bold text-sm text-right">
                        {data.columns[colIndex]?.showSum ? getColumnSum(colIndex) : ''}
                      </td>
                    ))}
                    <td className="border-0 p-0" />
                    <td className="border-0 p-0" />
                  </tr>
                )}
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
          
          {/* Totals section — uses the rightmost column with showSum enabled */}
          <TotalsSection subtotal={(() => {
            const sumColIndex = data.columns.reduce((last, col, i) => col.showSum ? i : last, -1)
            return sumColIndex >= 0 ? getColumnSum(sumColIndex) : '0'
          })()} />
          
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
Note: Any type of civil & carpenter work will not be in our scope.
Advance Payment: 25% of labour charges paid upfront for the rolling of workers on site/ work. Remaining as we progress through the job.`}
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

      {/* Footer */}
      <div className="border-t border-border bg-card">
        <div className="max-w-[1080px] mx-auto py-3 px-4 text-center text-xs text-muted-foreground">
          All rights reserved. A product of{' '}
          <a href="https://browse.fyi" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
            browse.fyi
          </a>
        </div>
      </div>

      {/* Formula editor dialog */}
      <Dialog open={formulaDialog !== null} onOpenChange={(open) => { if (!open) setFormulaDialog(null) }}>
        <DialogContent className="sm:max-w-sm shadow-none">
          <DialogHeader>
            <DialogTitle>
              Formula for &ldquo;{formulaDialog !== null ? headerNames[formulaDialog.colIndex] || 'Column' : ''}&rdquo;
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Formula preview */}
            <div className="min-h-[40px] border border-input rounded-md px-3 py-2 text-sm font-mono bg-muted/30">
              {formulaDialog?.draft || <span className="text-muted-foreground">Tap columns &amp; operators below</span>}
            </div>

            {/* Column chips */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Columns</label>
              <div className="flex flex-wrap gap-1.5">
                {headerNames.map((name, i) => {
                  if (!name || (formulaDialog && i === formulaDialog.colIndex)) return null
                  return (
                    <button
                      key={i}
                      className="px-2.5 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
                      onClick={() => setFormulaDialog(prev => prev ? { ...prev, draft: (prev.draft ? prev.draft + ' ' : '') + name } : null)}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Operator buttons */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Operators</label>
              <div className="flex gap-1.5">
                {[{ label: '+', value: ' + ' }, { label: '−', value: ' - ' }, { label: '×', value: ' * ' }, { label: '÷', value: ' / ' }, { label: '( )', value: '' }].map(op => (
                  <button
                    key={op.label}
                    className="h-9 w-9 flex items-center justify-center text-sm font-bold border border-border rounded-md hover:bg-accent transition-colors"
                    onClick={() => {
                      if (op.label === '( )') {
                        setFormulaDialog(prev => prev ? { ...prev, draft: prev.draft + ' (' } : null)
                      } else {
                        setFormulaDialog(prev => prev ? { ...prev, draft: prev.draft + op.value } : null)
                      }
                    }}
                  >
                    {op.label}
                  </button>
                ))}
                <button
                  className="h-9 px-2 flex items-center justify-center text-xs border border-border rounded-md hover:bg-accent transition-colors"
                  onClick={() => setFormulaDialog(prev => prev ? { ...prev, draft: prev.draft + ' )' } : null)}
                >
                  )
                </button>
                <button
                  className="h-9 px-3 flex items-center justify-center text-xs text-destructive border border-border rounded-md hover:bg-destructive/10 transition-colors ml-auto"
                  onClick={() => setFormulaDialog(prev => prev ? { ...prev, draft: '' } : null)}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Validation */}
            {formulaDialog?.draft ? (() => {
              const otherNames = headerNames.filter((_, i) => i !== formulaDialog.colIndex)
              const result = evaluateFormula(formulaDialog.draft, Object.fromEntries(otherNames.map(n => [n, 1])), otherNames)
              return (
                <div className={`text-xs ${result !== null ? 'text-green-600' : 'text-destructive'}`}>
                  {result !== null ? 'Valid formula' : 'Check your formula'}
                </div>
              )
            })() : null}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFormulaDialog(null)}>Cancel</Button>
            <Button size="sm" onClick={() => {
              if (formulaDialog) {
                setColumnFormula(formulaDialog.colIndex, formulaDialog.draft.trim() || null)
                setFormulaDialog(null)
              }
            }}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Computed (formula) cell — read-only
const ComputedCell = memo(function ComputedCell({ value }: { value: string }) {
  return (
    <div className="p-2 min-h-[40px] text-sm text-right tabular-nums bg-muted/60">
      {value}
    </div>
  )
})

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
        ${isHeader ? 'font-semibold text-sm flex-1 whitespace-nowrap overflow-hidden' : 'text-sm'}
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
