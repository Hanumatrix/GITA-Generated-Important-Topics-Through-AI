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

    const wikiUrl = await fetchFromWikipedia(topic);
    if (wikiUrl) {
      // Return same-origin proxied URL so production CSP allows the image
      const proxied = `/api/proxy-image?url=${encodeURIComponent(wikiUrl)}`;
      return Response.json({ success: true, imageUrl: proxied });
    }

    const diagramUrl = await fetchDiagramFromGoogle(topic);
    if (diagramUrl) {
      const proxied = `/api/proxy-image?url=${encodeURIComponent(diagramUrl)}`;
      return Response.json({ success: true, imageUrl: proxied });
    }

    return Response.json({
      success: true,
      imageUrl: null,
      message: "No diagram available",
    });
  } catch (error) {
    console.error("Error fetching diagram:", error);
    return Response.json(
      {
        success: false,
        imageUrl: null,
        error: "Failed to fetch diagram",
      },
      { status: 200 }
    );
  }
}

async function fetchFromWikipedia(topic: string): Promise<string | null> {
  try {
    const encodedTopic = encodeURIComponent(topic);

    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=${encodedTopic}&limit=1&origin=*`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData[1] || searchData[1].length === 0) {
      return null;
    }

    const pageTitle = searchData[1][0];

    const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|images&titles=${encodeURIComponent(pageTitle)}&pithumbsize=800&pilimit=10&origin=*`;
    const response = await fetch(imageUrl);
    const data = await response.json();

    const pages = data.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      const page = pages[pageId];

      if (page?.thumbnail?.source) {
        return page.thumbnail.source;
      }

      if (page?.images && page.images.length > 0) {
        for (const img of page.images) {
          const imgTitle = img.title;
          if (
            !imgTitle.includes("Icon") &&
            !imgTitle.includes("Commons-logo")
          ) {
            const imgUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&titles=${encodeURIComponent(imgTitle)}&iiprop=url&iiurlwidth=800&origin=*`;
            const imgResponse = await fetch(imgUrl);
            const imgData = await imgResponse.json();
            const imgPages = imgData.query?.pages;

            if (imgPages) {
              const imgPageId = Object.keys(imgPages)[0];
              const imageUrl =
                imgPages[imgPageId]?.imageinfo?.[0]?.thumburl ||
                imgPages[imgPageId]?.imageinfo?.[0]?.url;
              if (imageUrl) {
                return imageUrl;
              }
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching from Wikipedia:", error);
    return null;
  }
}

async function fetchDiagramFromGoogle(topic: string): Promise<string | null> {
  try {
    const searchQuery = `${topic} diagram educational`;
    // encode inline to avoid potential minification/scope issues
    const encoded = encodeURIComponent(searchQuery);

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!apiKey || !searchEngineId) {
      return null;
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encoded}&searchType=image&num=3&imgSize=large&safe=active`;

    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        if (item.link && !item.link.includes("placeholder")) {
          return item.link;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching from Google:", error);
    return null;
  }
}
