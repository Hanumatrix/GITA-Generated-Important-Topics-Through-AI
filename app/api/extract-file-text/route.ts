import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "buffer";

// Ensure this route runs in a Node.js runtime (so native Node modules like Buffer
// and some native-style npm packages work correctly on Vercel)
export const runtime = "nodejs";

// Magic bytes for file type detection
const MAGIC_BYTES = {
  PDF: { bytes: [0x25, 0x50, 0x44, 0x46], name: "PDF" }, // %PDF
  DOCX: { bytes: [0x50, 0x4b, 0x03, 0x04], name: "DOCX" }, // PK\x03\x04 (ZIP)
};

// Helper to detect file type by magic bytes
function detectFileTypeByMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  const headerBytes = buffer.slice(0, 4);

  if (
    headerBytes[0] === MAGIC_BYTES.PDF.bytes[0] &&
    headerBytes[1] === MAGIC_BYTES.PDF.bytes[1] &&
    headerBytes[2] === MAGIC_BYTES.PDF.bytes[2] &&
    headerBytes[3] === MAGIC_BYTES.PDF.bytes[3]
  ) {
    return "pdf";
  }

  if (
    headerBytes[0] === MAGIC_BYTES.DOCX.bytes[0] &&
    headerBytes[1] === MAGIC_BYTES.DOCX.bytes[1] &&
    headerBytes[2] === MAGIC_BYTES.DOCX.bytes[2] &&
    headerBytes[3] === MAGIC_BYTES.DOCX.bytes[3]
  ) {
    return "docx";
  }

  return null;
}

// Helper to extract text from PDF buffer
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const PDFParser = (await import("pdf2json")).default;
  const pdfParser = new (PDFParser as any)(null, 1);

  const parsePDF = new Promise<string>((resolve, reject) => {
    pdfParser.on("pdfParser_dataError", (errData: any) => {
      console.error("PDF Parser Error:", errData);
      reject(new Error(errData.parserError || "PDF parsing failed"));
    });

    pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
      try {
        const pages = pdfData.Pages || [];

        if (pages.length === 0) {
          reject(new Error("No pages found in PDF"));
          return;
        }

        let extractedText = "";

        // Better text extraction from pdf2json
        for (const page of pages) {
          if (!page.Texts) continue;

          for (const textItem of page.Texts) {
            if (!textItem.R) continue;

            for (const run of textItem.R) {
              if (run.T) {
                try {
                  // Decode URI component and replace encoded spaces
                  const decodedText = decodeURIComponent(run.T);
                  extractedText += decodedText + " ";
                } catch (e) {
                  // If decode fails, use raw text
                  extractedText += run.T + " ";
                }
              }
            }
          }
          extractedText += "\n\n"; // Add page break
        }

        console.log(`Raw extracted text length: ${extractedText.length}`);
        console.log(`First 200 chars: ${extractedText.substring(0, 200)}`);

        resolve(extractedText.trim());
      } catch (err: any) {
        console.error("Text extraction error:", err);
        reject(err);
      }
    });

    pdfParser.parseBuffer(buffer);
  });

  return parsePDF;
}

// Helper to extract text from DOCX buffer
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return (result?.value || "").trim();
}

export async function POST(req: NextRequest) {
  try {
    // Helpful debug log to confirm runtime and incoming request
    try {
      if (process.env.NODE_ENV !== "production") {
        console.log(
          "/api/extract-file-text runtime:",
          process.env.NEXT_RUNTIME || "nodejs"
        );
      }
    } catch (e) {
      /* ignore logging errors */
    }
    // Validate Content-Type before attempting to parse form data to provide
    // clearer diagnostics on Vercel where some requests may not include
    // multipart/form-data (which `req.formData()` requires).
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    // Some proxies or edge layers may strip the Content-Type header; allow
    // an empty header and attempt to parse `formData()` as a best-effort.
    const isExplicitMultipart =
      contentType.startsWith("multipart/form-data") ||
      contentType.startsWith("application/x-www-form-urlencoded");

    if (!isExplicitMultipart && contentType !== "") {
      // Log headers so you can inspect them in Vercel function logs
      try {
        const headersSnapshot = Array.from(req.headers.entries());
        console.error(
          "Invalid Content-Type for file upload:",
          contentType,
          headersSnapshot
        );
      } catch (e) {
        console.error("Invalid Content-Type and failed to snapshot headers", e);
      }

      return NextResponse.json(
        {
          error:
            "Invalid Content-Type. This endpoint expects a multipart/form-data upload (FormData). Do NOT set the Content-Type header manually when using FormData from the browser.",
        },
        { status: 400 }
      );
    }

    // Attempt to parse the form data. If the Content-Type header was empty
    // we still try, but handle parse failures gracefully and return a useful
    // error that includes headers for debugging on Vercel.
    let formData: FormData | null = null;
    let file: File | null = null;

    try {
      formData = await req.formData();
      file = formData.get("file") as File;
    } catch (err: any) {
      console.error(
        "Failed to parse formData(), attempting raw-body fallback:",
        err
      );
      try {
        const headersSnapshot = Array.from(req.headers.entries());
        console.error("Headers when formData() failed:", headersSnapshot);
      } catch (e) {
        console.error("Failed to snapshot headers after formData() failure", e);
      }

      // Fallback: try to read raw request body and detect file type by magic bytes
      console.log("Attempting raw-body fallback for file extraction...");
      try {
        const arrayBuffer = await req.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length === 0) {
          return NextResponse.json(
            {
              error: "Request body is empty. Could not extract file.",
            },
            { status: 400 }
          );
        }

        // Detect file type by magic bytes
        const detectedType = detectFileTypeByMagicBytes(buffer);
        console.log(`Detected file type from magic bytes: ${detectedType}`);

        let text = "";

        if (detectedType === "pdf") {
          text = await extractTextFromPDF(buffer);
          if (!text || text.length < 50) {
            console.log(`PDF text too short: ${text.length} characters`);
            return NextResponse.json(
              {
                error: `PDF appears to be scanned, image-based, or empty (extracted only ${text.length} characters). Please try uploading the PDF as a .txt file instead, or use a different PDF.`,
              },
              { status: 400 }
            );
          }
        } else if (detectedType === "docx") {
          text = await extractTextFromDOCX(buffer);
          if (!text || text.length < 50) {
            return NextResponse.json(
              {
                error:
                  "DOCX file is empty or could not be parsed. Please check the file.",
              },
              { status: 400 }
            );
          }
        } else {
          // Assume plain text for unknown types
          text = buffer.toString("utf-8").trim();
          if (!text || text.length < 50) {
            return NextResponse.json(
              {
                error: "File appears to be empty or not a valid text file.",
              },
              { status: 400 }
            );
          }
        }

        console.log(
          `✅ Successfully extracted ${text.length} characters from raw body (fallback)`
        );

        return NextResponse.json({
          success: true,
          text,
          filename: "uploaded_file",
          size: text.length,
        });
      } catch (fallbackErr: any) {
        console.error("Raw-body fallback also failed:", fallbackErr);
        return NextResponse.json(
          {
            error:
              "Could not parse multipart form data or read raw request body. Ensure the client sends a browser `FormData` body and does NOT set `Content-Type` manually.",
          },
          { status: 400 }
        );
      }
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    let text = "";

    if (filename.endsWith(".txt")) {
      text = await file.text();
    } else if (filename.endsWith(".pdf")) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        text = await extractTextFromPDF(buffer);

        if (!text || text.length < 50) {
          console.log(`PDF text too short: ${text.length} characters`);
          return NextResponse.json(
            {
              error: `PDF appears to be scanned, image-based, or empty (extracted only ${text.length} characters). Please try uploading the PDF as a .txt file instead, or use a different PDF.`,
            },
            { status: 400 }
          );
        }
      } catch (err: any) {
        console.error("PDF extraction error:", err);
        return NextResponse.json(
          {
            error: `Failed to extract PDF: ${err.message || "Unknown error"}`,
          },
          { status: 400 }
        );
      }
    } else if (filename.endsWith(".docx") || filename.endsWith(".doc")) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        text = await extractTextFromDOCX(buffer);

        if (!text || text.length < 50) {
          return NextResponse.json(
            {
              error:
                "DOCX file is empty or could not be parsed. Please check the file.",
            },
            { status: 400 }
          );
        }
      } catch (err: any) {
        console.error("DOCX extraction error:", err);
        return NextResponse.json(
          {
            error: `Failed to extract DOCX: ${err.message}`,
          },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        {
          error: `Unsupported file format: ${filename}. Supported: .txt, .pdf, .docx`,
        },
        { status: 400 }
      );
    }

    console.log(
      `✅ Successfully extracted ${text.length} characters from ${file.name}`
    );

    return NextResponse.json({
      success: true,
      text,
      filename: file.name,
      size: text.length,
    });
  } catch (error: any) {
    console.error("File extraction error:", error);

    const body: any = {
      error: error instanceof Error ? error.message : "File extraction failed",
    };
    if (process.env.NODE_ENV !== "production" && error?.stack) {
      body.stack = error.stack;
    }

    return NextResponse.json(body, { status: 500 });
  }
}
