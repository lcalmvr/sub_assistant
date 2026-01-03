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
  scrollTrigger = 0, // Increment to force scroll even to same page
  className = '',
}) {
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const [totalPages, setTotalPages] = useState(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [containerWidth, setContainerWidth] = useState(600);
  const [pendingScroll, setPendingScroll] = useState(null);

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

  // Calculate scale to fit container width (must be before useEffects that use it)
  const scale = pageSize.width ? Math.min(containerWidth / pageSize.width, 1.5) : 1;

  // Track pending scroll when trigger changes
  useEffect(() => {
    if (scrollTrigger > 0 && initialPage) {
      setPendingScroll(initialPage);
    }
  }, [scrollTrigger, initialPage]);

  // Get highlights array (support both old single highlight and new array format)
  const highlights = highlight?.highlights || (highlight?.bbox ? [{ page: highlight.page, bbox: highlight.bbox, type: 'primary' }] : []);

  // Execute scroll when pages are rendered and we have a pending scroll
  useEffect(() => {
    if (!pendingScroll || !containerRef.current || !totalPages) return;

    // Use requestAnimationFrame to wait for page refs to be set after render
    const scrollToPage = () => {
      const pageEl = pageRefs.current[pendingScroll];
      if (!pageEl) return; // Page not rendered yet

      const container = containerRef.current;
      if (!container) return;

      const pageRect = pageEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Find first highlight on this page to center on
      const pageHighlights = highlights.filter(h => h.page === pendingScroll);
      const centerHighlight = pageHighlights[0]; // Use first highlight for centering

      let scrollTop;
      if (centerHighlight && centerHighlight.bbox && pageSize.height > 0) {
        // Calculate highlight position within the page
        const highlightTop = centerHighlight.bbox.top * pageSize.height * scale;
        const highlightHeight = centerHighlight.bbox.height * pageSize.height * scale;
        const highlightCenter = highlightTop + highlightHeight / 2;

        // Scroll to put highlight in center of viewport
        const containerHeight = containerRect.height;
        scrollTop = pageRect.top - containerRect.top + container.scrollTop + highlightCenter - containerHeight / 2;
      } else {
        // No highlight, scroll to page top
        scrollTop = pageRect.top - containerRect.top + container.scrollTop - 8;
      }

      container.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
      setPendingScroll(null);
    };

    // Wait for next frame to ensure refs are populated
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToPage);
    });
  }, [pendingScroll, totalPages, highlights, pageSize, scale]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setTotalPages(numPages);
  };

  const onPageLoadSuccess = (page) => {
    if (!pageSize.width) {
      setPageSize({ width: page.originalWidth, height: page.originalHeight });
    }
  };

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
                {/* Highlight overlays for this page (supports multiple: question + answer) */}
                {pageSize.width > 0 && highlights
                  .filter(h => h.page === pageNum)
                  .map((h, idx) => {
                    // Different styles for question vs answer
                    const isQuestion = h.type === 'question';
                    const isAnswer = h.type === 'answer';

                    // Add padding around highlights for better visibility
                    const padding = 4; // pixels of padding on each side

                    return (
                      <div
                        key={`highlight-${pageNum}-${idx}`}
                        className={`absolute pointer-events-none ${isAnswer ? 'animate-pulse' : ''}`}
                        style={{
                          left: `${h.bbox.left * pageSize.width * scale - padding}px`,
                          top: `${h.bbox.top * pageSize.height * scale - padding}px`,
                          width: `${h.bbox.width * pageSize.width * scale + padding * 2}px`,
                          height: `${h.bbox.height * pageSize.height * scale + padding * 2}px`,
                          // Question: blue solid outline, Answer: yellow fill with pulse
                          backgroundColor: isQuestion
                            ? 'rgba(59, 130, 246, 0.2)'  // Light blue
                            : isAnswer
                              ? 'rgba(234, 179, 8, 0.4)'  // Yellow
                              : 'rgba(147, 51, 234, 0.4)', // Purple (legacy)
                          border: isQuestion
                            ? '2px solid #3b82f6'  // Blue solid
                            : isAnswer
                              ? '2px solid #ca8a04'  // Yellow solid
                              : '2px solid #7c3aed', // Purple (legacy)
                          borderRadius: '4px',
                          zIndex: isAnswer ? 11 : 10, // Answer on top
                        }}
                      />
                    );
                  })
                }
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
