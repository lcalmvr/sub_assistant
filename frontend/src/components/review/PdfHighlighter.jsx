import { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * PDF viewer with precise highlight overlay.
 * Renders all pages in a scrollable container.
 */
export default function PdfHighlighter({
  url,
  highlight = null,
  initialPage = 1,
  className = '',
}) {
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const [totalPages, setTotalPages] = useState(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [containerWidth, setContainerWidth] = useState(600);

  // Measure container width for responsive scaling
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width - 32); // Account for padding
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Scroll to page when initialPage changes (within container only)
  useEffect(() => {
    if (initialPage && pageRefs.current[initialPage] && containerRef.current) {
      const container = containerRef.current;
      const pageEl = pageRefs.current[initialPage];
      const containerTop = container.getBoundingClientRect().top;
      const pageTop = pageEl.getBoundingClientRect().top;
      const scrollOffset = pageTop - containerTop + container.scrollTop - 16; // 16px padding
      container.scrollTo({ top: scrollOffset, behavior: 'smooth' });
    }
  }, [initialPage, totalPages]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setTotalPages(numPages);
  };

  const onPageLoadSuccess = (page) => {
    if (!pageSize.width) {
      setPageSize({ width: page.originalWidth, height: page.originalHeight });
    }
  };

  // Calculate scale to fit container width
  const scale = pageSize.width ? Math.min(containerWidth / pageSize.width, 1.5) : 1;

  return (
    <div
      ref={containerRef}
      className={`h-full overflow-y-auto bg-gray-200 ${className}`}
      style={{ overflowY: 'scroll' }}
    >
      {url ? (
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center h-64 text-gray-500">
              Loading PDF...
            </div>
          }
          error={
            <div className="flex items-center justify-center h-64 text-red-500">
              Failed to load PDF
            </div>
          }
        >
          <div className="flex flex-col items-center py-4 gap-4">
            {totalPages && Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                ref={(el) => pageRefs.current[pageNum] = el}
                className="relative shadow-lg bg-white"
              >
                <Page
                  pageNumber={pageNum}
                  scale={scale}
                  onLoadSuccess={pageNum === 1 ? onPageLoadSuccess : undefined}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
                {/* Highlight overlay for this page */}
                {highlight && highlight.page === pageNum && pageSize.width > 0 && (
                  <div
                    className="absolute pointer-events-none animate-pulse"
                    style={{
                      left: `${highlight.bbox.left * pageSize.width * scale}px`,
                      top: `${highlight.bbox.top * pageSize.height * scale}px`,
                      width: `${highlight.bbox.width * pageSize.width * scale}px`,
                      height: `${highlight.bbox.height * pageSize.height * scale}px`,
                      backgroundColor: highlight.color || 'rgba(147, 51, 234, 0.4)',
                      border: '2px solid #7c3aed',
                      borderRadius: '2px',
                      zIndex: 10,
                    }}
                  />
                )}
                {/* Page number */}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
                  {pageNum}
                </div>
              </div>
            ))}
          </div>
        </Document>
      ) : (
        <div className="flex items-center justify-center h-full text-gray-500">
          No document selected
        </div>
      )}
    </div>
  );
}
