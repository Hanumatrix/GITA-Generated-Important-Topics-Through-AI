export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topic } = body || {};

    if (!topic) {
      return new Response(
        JSON.stringify({ error: "Missing required field: topic" }),
        { status: 400 }
      );
    }

    // Try to fetch educational diagram from Google Images
    const diagramUrl = await fetchDiagramFromGoogle(topic);
    if (diagramUrl) {
      return Response.json({ success: true, imageUrl: diagramUrl });
    }

    // Fallback to Wikipedia/educational sources
    const wikiUrl = await fetchFromWikipedia(topic);
    if (wikiUrl) {
      return Response.json({ success: true, imageUrl: wikiUrl });
    }

    // Last resort: Generate a placeholder that indicates diagram needed
    return Response.json({
      success: true,
      imageUrl: `https://via.placeholder.com/800x600/1e293b/60a5fa?text=${encodeURIComponent(
        topic + "\n(Diagram Not Available)"
      )}`,
    });
  } catch (error) {
    console.error("Error fetching diagram:", error);
    return Response.json(
      {
        success: true,
        imageUrl: `https://via.placeholder.com/800x600/1e293b/60a5fa?text=Diagram+Not+Available`,
      },
      { status: 200 }
    );
  }
}

// Fetch educational diagrams from Google Custom Search
async function fetchDiagramFromGoogle(topic: string): Promise<string | null> {
  try {
    // Add diagram/illustration keywords to search
    const searchQuery = `${topic} diagram illustration infographic chart`;
    const encodedQuery = encodeURIComponent(searchQuery);

    // Google Custom Search API
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!apiKey || !searchEngineId) {
      console.log("Google Search API credentials not found");
      return null;
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodedQuery}&searchType=image&num=1&imgType=clipart&imgSize=large`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Google Search API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      console.log(`Found diagram for "${topic}"`);
      return data.items[0].link;
    }

    return null;
  } catch (error) {
    console.error("Error fetching from Google:", error);
    return null;
  }
}

// Fetch diagrams from Wikipedia
async function fetchFromWikipedia(topic: string): Promise<string | null> {
  try {
    const encodedTopic = encodeURIComponent(topic);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&titles=${encodedTopic}&pithumbsize=800&origin=*`;

    const response = await fetch(searchUrl);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const pages = data.query?.pages;

    if (pages) {
      const pageId = Object.keys(pages)[0];
      const thumbnail = pages[pageId]?.thumbnail?.source;

      if (thumbnail) {
        console.log(`Found Wikipedia image for "${topic}"`);
        return thumbnail;
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching from Wikipedia:", error);
    return null;
  }
}
