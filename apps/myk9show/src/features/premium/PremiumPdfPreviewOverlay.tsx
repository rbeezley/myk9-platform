interface PremiumPdfPreviewOverlayProps {
  title: string;
  pdfUrl: string | null;
  onClose: () => void;
}

/** The premium editor's full-screen PDF preview. A tap on the backdrop closes it. */
export function PremiumPdfPreviewOverlay({
  title,
  pdfUrl,
  onClose,
}: PremiumPdfPreviewOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[92vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium text-gray-900">{title}</span>
          <button
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            onClick={onClose}
            aria-label="Close preview"
          >
            x
          </button>
        </div>
        {pdfUrl && <iframe src={pdfUrl} className="flex-1 border-0" title="PDF Preview" />}
      </div>
    </div>
  );
}
