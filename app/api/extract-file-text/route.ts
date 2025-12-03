import { NextResponse } from "next/server";
import { Buffer } from "buffer";

export const runtime = "nodejs";

const MAGIC_BYTES = {
  PDF: { bytes: [0x25, 0x50, 0x44, 0x46], name: "PDF" }, // %PDF
  DOCX: { bytes: [0x50, 0x4b, 0x03, 0x04], name: "DOCX" }, // PK\x03\x04 (ZIP)
};

// Detect file type (PDF/DOCX) by reading first 4 bytes
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

// Extract text from PDF using pdf2json library
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

// Extract text from DOCX using mammoth library
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return (result?.value || "").trim();
}

// File extraction endpoint: accepts .txt, .pdf, or .docx uploads and returns extracted text
export async function POST(req: Request) {
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
    // Check Content-Type to decide parsing strategy
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    const isExplicitMultipart =
      contentType.startsWith("multipart/form-data") ||
      contentType.startsWith("application/x-www-form-urlencoded");
    const isJSON = contentType.startsWith("application/json");

    // Read request body once (streaming bodies can only be read once)
    let bodyBuffer: Buffer;
    try {
      const arrayBuffer = await req.arrayBuffer();
      bodyBuffer = Buffer.from(arrayBuffer);
    } catch (err: any) {
      console.error("Failed to read request body:", err.message || err);
      return NextResponse.json(
        {
          error: "Failed to read request body.",
        },
        { status: 400 }
      );
    }

    // Try FormData first
    let formData: FormData | null = null;
    let file: File | null = null;

    if (isExplicitMultipart && bodyBuffer.length > 0) {
      try {
        // Reconstruct a fresh Request from the buffer to parse formData
        const reconstructedReq = new Request(req.url, {
          method: req.method,
          headers: req.headers,
          body: new Uint8Array(bodyBuffer),
        });
        formData = await reconstructedReq.formData();
        file = formData.get("file") as File;
      } catch (err: any) {
        console.error(
          "Failed to parse formData() from body:",
          err.message || err
        );
        formData = null;
        file = null;
      }
    }

    // Fallback: try JSON parsing if FormData failed
    if (!file && isJSON && bodyBuffer.length > 0) {
      console.log(
        "Attempting JSON fallback (Content-Type is application/json)..."
      );
      try {
        const jsonText = bodyBuffer.toString("utf-8");
        const json = JSON.parse(jsonText);
        console.log("JSON parsed, looking for file data...");

        // Extract file data from JSON (could be base64 or nested structure)
        let fileBuffer: Buffer | null = null;
        let filename = "uploaded_file";

        if (json && typeof json === "object") {
          if (json.fileData && typeof json.fileData === "string") {
            console.log("Found base64-encoded fileData");
            fileBuffer = Buffer.from(json.fileData, "base64");
            filename = json.filename || filename;
          }
          else if (json.file && typeof json.file === "string") {
            console.log("Found base64-encoded file field");
            fileBuffer = Buffer.from(json.file, "base64");
            filename = json.filename || filename;
          }
          else if (Array.isArray(json)) {
            for (const [key, val] of json) {
              if (key === "file" && typeof val === "string") {
                console.log("Found file in FormData array as base64");
                fileBuffer = Buffer.from(val, "base64");
                filename = filename;
                break;
              }
            }
          }
        }

        if (fileBuffer && fileBuffer.length > 0) {
          const detectedType = detectFileTypeByMagicBytes(fileBuffer);
          console.log(`Detected file type from magic bytes: ${detectedType}`);

          let text = "";

          if (detectedType === "pdf") {
            text = await extractTextFromPDF(fileBuffer);
          } else if (detectedType === "docx") {
            text = await extractTextFromDOCX(fileBuffer);
          } else {
            text = fileBuffer.toString("utf-8").trim();
          }

          if (!text || text.length < 50) {
            return NextResponse.json(
              {
                error: `Extracted text is too short (${text.length} characters). File may be empty, image-based, or unreadable.`,
              },
              { status: 400 }
            );
          }

          console.log(
            `✅ Successfully extracted ${text.length} characters from JSON payload (fallback)`
          );

          return NextResponse.json({
            success: true,
            text,
            filename,
            size: text.length,
          });
        }
      } catch (jsonErr: any) {
        console.error(
          "JSON fallback parsing failed:",
          jsonErr.message || jsonErr
        );
      }
    }

    // Last fallback: detect by magic bytes and extract
    if (!file && bodyBuffer.length > 0) {
      console.log("Attempting raw-body fallback with magic byte detection...");
      try {
        const detectedType = detectFileTypeByMagicBytes(bodyBuffer);
        console.log(`Detected file type from magic bytes: ${detectedType}`);

        let text = "";

        if (detectedType === "pdf") {
          text = await extractTextFromPDF(bodyBuffer);
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
          text = await extractTextFromDOCX(bodyBuffer);
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
          text = bodyBuffer.toString("utf-8").trim();
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
        console.error(
          "Raw-body fallback also failed:",
          fallbackErr.message || fallbackErr
        );
        return NextResponse.json(
          {
            error:
              "Could not parse multipart form data, JSON, or raw request body. Ensure the client sends a browser `FormData` body and does NOT set `Content-Type` manually.",
          },
          { status: 400 }
        );
      }
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Process file based on extension
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
