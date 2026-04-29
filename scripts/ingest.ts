import fs from 'fs';
import path from 'path';

async function ingestArticle() {
    console.log("Starting ingestion process...");
    
    // Read the article
    const articlePath = path.resolve(process.cwd(), 'article.md');
    if (!fs.existsSync(articlePath)) {
        console.error("article.md not found. Please ensure it exists in the root directory.");
        process.exit(1);
    }

    const articleText = fs.readFileSync(articlePath, 'utf8');
    console.log(`Read article.md (${articleText.length} characters).`);

    const prompt = `Act as a professional podcast script-writer for Narratif, an AI-powered podcast studio for media companies.

You are creating a premium, two-host podcast episode for a written media outlet called "Narratif Demo".

Article context:
- Media outlet name: Narratif Demo
- Type: Magazine / Digital Outlet
- Section / topic: General
- Article title: Executive Introduction
- Main advertiser(s): None
- Target audience: General Readers

Hosts:
- Host 1 - Host 1 (The Guide):
  - Senior, authoritative, calm, and clear.
  - Explains the article, cites data, and frames the story.
- Host 2 - Host 2 (The Curious Co-Host):
  - Inquisitive, practical, and critical.
  - Asks "What does this mean for me?" and challenges assumptions.
  - Brings in real-world examples and wider context.

Your task:
Generate a **two-host, conversational podcast episode** script between Host 1 and Host 2 in the style of a Narrative-style deep-dive talk podcast. The episode should help listeners **understand a complex article** they might otherwise skip or struggle with.

Output format:
- Return a JSON object with one field:
  - "script": an array of dialogue turns.
- Each turn is an object:
  - "speaker": "Host 1" or "Host 2"
  - "text": the spoken line (plain natural language, no markdown).

Final output MUST BE valid JSON strictly matching:
{
  "script": [
    {
      "speaker": "Host 1",
      "text": "Welcome to Narratif Podcast. Today we're talking about..."
    },
    {
      "speaker": "Host 2",
      "text": "I read the article, and the first thing..."
    }
  ]
}

---
ARTICLE TO TRANSFORM:
${articleText}`;

    console.log("Sending request to local server for transcript generation...");
    console.log("Ensure that you have added your API keys in the app settings first!");

    try {
        const response = await fetch("http://localhost:3000/api/v1/generate-transcript", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            throw new Error(`Server returned status: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        console.log("\n--- GENERATED PODCAST SCRIPT ---");
        console.log(`Title: ${data.title}`);
        console.log(`Teaser: ${data.teaser}`);
        console.log(`Segments: ${data.segments?.length || 0}`);
        
        fs.writeFileSync(
            path.resolve(process.cwd(), 'generated_script.json'), 
            JSON.stringify(data, null, 2)
        );
        console.log("\nSaved generated script to generated_script.json");
        
    } catch (e: any) {
        console.error("\nIngestion failed:", e.message);
        console.error("If the generation providers failed, please verify your API keys in the Settings menu.");
    }
}

ingestArticle();
