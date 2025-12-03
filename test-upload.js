#!/usr/bin/env node

/**
 * Test script to verify the /api/extract-file-text endpoint
 * Tests with .txt, .pdf, and .docx files
 */

const fs = require("fs");
const path = require("path");
const http = require("http");

const BASE_URL = "http://localhost:3000";
const ENDPOINT = "/api/extract-file-text";

// Helper to read file and send as FormData
async function testFileUpload(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, fileBuffer) => {
      if (err) {
        reject(new Error(`Failed to read file ${filePath}: ${err.message}`));
        return;
      }

      const fileName = path.basename(filePath);
      const boundary =
        "WebKitFormBoundary" + Math.random().toString(16).substring(2);

      // Build multipart/form-data body manually
      const formDataParts = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
        `Content-Type: application/octet-stream`,
        "",
      ];

      const formDataBefore = Buffer.from(formDataParts.join("\r\n") + "\r\n");
      const formDataAfter = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([formDataBefore, fileBuffer, formDataAfter]);

      const url = new URL(BASE_URL + ENDPOINT);
      const options = {
        hostname: url.hostname,
        port: url.port || 3000,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              status: res.statusCode,
              file: fileName,
              success: parsed.success,
              textLength: parsed.size,
              error: parsed.error,
            });
          } catch (e) {
            reject(
              new Error(
                `Failed to parse response (status ${res.statusCode}): ${data.substring(0, 200)}`
              )
            );
          }
        });
      });

      req.on("error", (err) => {
        reject(new Error(`HTTP error: ${err.message}`));
      });
      req.write(body);
      req.end();
    });
  });
}

async function main() {
  // Create test files if they don't exist
  const testDir = path.join(process.cwd(), "__test_files");
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

  // Create test .txt file
  const txtFile = path.join(testDir, "test.txt");
  if (!fs.existsSync(txtFile)) {
    fs.writeFileSync(
      txtFile,
      "This is a test text file with some sample content.\n\nIt has multiple paragraphs to ensure proper text extraction."
    );
  }

  console.log("🧪 Testing /api/extract-file-text endpoint...\n");

  // Give the server a moment to be ready
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Test with .txt file (simplest case)
  console.log("📝 Test 1: Plain text file (.txt)");
  try {
    const result = await testFileUpload(txtFile);
    console.log(`✅ Status: ${result.status}`);
    console.log(`   Success: ${result.success}`);
    console.log(`   Text length: ${result.textLength} chars`);
    if (result.error) console.log(`   Error: ${result.error}`);
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }

  console.log("\n---\n");

  // Test with actual project files
  const files = [
    {
      path: "d:\\PC\\new project\\syllabus-data-visualization\\package.json",
      label: "JSON file (package.json)",
    },
    {
      path: "d:\\PC\\new project\\syllabus-data-visualization\\tsconfig.json",
      label: "JSON file (tsconfig.json)",
    },
  ];

  for (const file of files) {
    if (fs.existsSync(file.path)) {
      console.log(`📄 Test: ${file.label}`);
      try {
        const result = await testFileUpload(file.path);
        console.log(`✅ Status: ${result.status}`);
        console.log(`   Success: ${result.success}`);
        console.log(`   Text length: ${result.textLength} chars`);
        if (result.error) console.log(`   Error: ${result.error}`);
      } catch (err) {
        console.log(`❌ Error: ${err.message}`);
      }
      console.log("\n---\n");
    }
  }

  console.log("✨ Tests completed!");
}

main().catch(console.error);
