import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "buffer";

// Ensure this route runs in a Node.js runtime (so native Node modules like Buffer
// and some native-style npm packages work correctly on Vercel)
export const runtime = "nodejs";

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
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (err: any) {
      console.error("Failed to parse formData():", err);
      try {
        const headersSnapshot = Array.from(req.headers.entries());
        console.error("Headers when formData() failed:", headersSnapshot);
      } catch (e) {
        console.error("Failed to snapshot headers after formData() failure", e);
      }

      return NextResponse.json(
        {
          error:
            "Could not parse multipart form data. Ensure the client sends a browser `FormData` body and does NOT set `Content-Type` manually. If you are using a proxy/CDN, verify it does not strip the Content-Type header.",
        },
        { status: 400 }
      );
    }
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    let text = "";

    if (filename.endsWith(".txt")) {
      text = await file.text();
    } else if (filename.endsWith(".pdf")) {
      try {
        const PDFParser = (await import("pdf2json")).default;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

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
              console.log(
                `First 200 chars: ${extractedText.substring(0, 200)}`
              );

              resolve(extractedText.trim());
            } catch (err: any) {
              console.error("Text extraction error:", err);
              reject(err);
            }
          });

          pdfParser.parseBuffer(buffer);
        });

        text = await parsePDF;

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
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const result = await mammoth.extractRawText({ buffer });
        text = (result?.value || "").trim();

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
