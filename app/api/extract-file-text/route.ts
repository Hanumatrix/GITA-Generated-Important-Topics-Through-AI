import { NextRequest, NextResponse } from "next/server";

// Server-side file extraction for PDF, DOCX, and TXT files
// This ensures the actual syllabus content reaches the AI, not placeholders

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
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
        // Dynamic import of pdfjs-dist
        const pdfjs = await import("pdfjs-dist");
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((it: any) => it.str || "");
          fullText += strings.join(" ") + "\n\n";
        }
        text = fullText.trim();

        if (!text || text.length < 50) {
          return NextResponse.json(
            {
              error:
                "PDF appears to be scanned or empty. Please upload a text-based PDF or convert to TXT.",
            },
            { status: 400 }
          );
        }
      } catch (err: any) {
        console.error("PDF extraction error:", err);
        return NextResponse.json(
          {
            error:
              "Failed to extract PDF. Install 'pdfjs-dist' or upload a TXT file instead.",
          },
          { status: 400 }
        );
      }
    } else if (filename.endsWith(".docx") || filename.endsWith(".doc")) {
      try {
        // Dynamic import of mammoth
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Mammoth expects a buffer option
        const result = await mammoth.extractRawText({
          buffer: buffer,
        });

        text = result && result.value ? result.value.trim() : "";

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
            error:
              "Failed to extract DOCX. Install 'mammoth' or upload a TXT file instead.",
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

    return NextResponse.json({
      success: true,
      text,
      filename,
      size: text.length,
    });
  } catch (error) {
    console.error("File extraction error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "File extraction failed",
      },
      { status: 500 }
    );
  }
}
