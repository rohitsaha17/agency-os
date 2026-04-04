/**
 * PDF export — opens a clean print window with embedded letterhead.
 * Uses the browser's native print-to-PDF instead of html2canvas,
 * so there are no oklch/color-parsing issues and the output is crisp A4.
 */

export interface PdfOptions {
  filename?: string;
}

/**
 * Open a new window with the provided HTML and trigger window.print().
 * The caller builds the complete HTML document (see lib/pdfTemplates.ts).
 */
export async function openPrintPdf(html: string): Promise<void> {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    // Fallback: if popup is blocked, try same-window print approach via iframe
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;border:none;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 600);
    return;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();

  // Wait for resources (fonts, images) to load before printing
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
      // Don't auto-close — let user see the document after saving
    }, 300);
  };

  // Fallback if onload doesn't fire (already loaded)
  setTimeout(() => {
    if (win.document.readyState === "complete") {
      win.focus();
      win.print();
    }
  }, 800);
}

/**
 * Fetch the company/letterhead settings from the API.
 */
export async function fetchSettings() {
  const res = await fetch("/api/settings/company");
  if (!res.ok) throw new Error("Failed to load letterhead settings");
  return res.json();
}
