'use client'

export default function PrintButton() {
  return (
    <div className="mb-6 print:hidden flex gap-4">
      <button
        onClick={() => window.print()}
        className="bg-neutral-900 hover:bg-neutral-800 text-white font-sans text-xs font-semibold uppercase tracking-widest px-6 py-3 rounded-md shadow-lg transition"
      >
        Imprimir Certificado (PDF) 🖨️
      </button>
    </div>
  )
}