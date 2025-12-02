// Helper function to extract text from different file types
// Uses server-side extraction endpoint for PDF/DOCX so the server handles parsing
// This ensures large libraries (pdfjs, mammoth) are only on the server, not shipped to clients
export async function extractTextFromFile(file: File): Promise<string> {
  const filename = file.name.toLowerCase();

  // For TXT, extract locally (no server round-trip needed)
  if (filename.endsWith(".txt")) {
    return file.text();
  }

  // For PDF, DOCX, and other formats, send to server for extraction
  if (
    filename.endsWith(".pdf") ||
    filename.endsWith(".docx") ||
    filename.endsWith(".doc")
  ) {
    try {
      // Try FormData first (standard approach)
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/extract-file-text", {
        method: "POST",
        body: formData,
        // Don't set Content-Type header manually - let the browser set it
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `File extraction failed (${response.status})`
        );
      }

      const result = await response.json();
      return result.text || "";
    } catch (err: any) {
      throw new Error(
        err instanceof Error
          ? err.message
          : "Failed to extract file text from server"
      );
    }
  }

  if (filename.endsWith(".pptx")) {
    throw new Error(
      "PPTX extraction is not supported. Please export slides to TXT or PDF and upload again."
    );
  }

  // Default for unknown formats
  throw new Error(`Unsupported file format: ${filename}`);
}
