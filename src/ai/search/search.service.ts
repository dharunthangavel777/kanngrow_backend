import { logger } from '../../core/config/logger.config';

export interface SearchSource {
  title: string;
  url: string;
}

export interface SearchResult {
  sources: SearchSource[];
  imageUrl?: string;
}

export class SearchService {
  /**
   * Helper to fetch JSON from a URL with a compliant User-Agent header.
   */
  private async getJson<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'KanngrowAI/1.0 (support@kanngrow.ai)'
        }
      });
      if (!res.ok) return null;
      return await res.json() as T;
    } catch (e) {
      logger.warn(`SearchService fetch error for ${url}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Cleans punctuation and removes common conversational stop-words from a query
   * to extract precise keywords for search engines.
   */
  private cleanQuery(query: string): string {
    const stopWords = new Set([
      'how', 'do', 'i', 'get', 'what', 'is', 'a', 'the', 'an', 'about', 'for', 'please',
      'register', 'me', 'show', 'tell', 'explain', 'check', 'list', 'find', 'search',
      'looking', 'want', 'to', 'need', 'of', 'on', 'in', 'with', 'at', 'by', 'can',
      'let', 'me', 'know', 'give', 'some', 'details', 'steps', 'process', 'guide'
    ]);
    const words = query
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // remove punctuation
      .split(/\s+/)
      .filter(w => w && !stopWords.has(w));
    return words.length > 0 ? words.join(' ') : query;
  }

  /**
   * Selects a high-quality free illustration fallback URL based on keywords in the query.
   */
  private getFallbackImage(query: string): string {
    const q = query.toLowerCase();
    
    // Legal/Registrations/Certificates
    if (
      q.includes('registration') ||
      q.includes('certificate') ||
      q.includes('legal') ||
      q.includes('udyam') ||
      q.includes('gst') ||
      q.includes('incorporation') ||
      q.includes('license') ||
      q.includes('tax')
    ) {
      return 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=600&q=80';
    }

    // E-commerce/Stores/Dropshipping
    if (
      q.includes('dropshipping') ||
      q.includes('e-commerce') ||
      q.includes('shopify') ||
      q.includes('store') ||
      q.includes('retail') ||
      q.includes('selling') ||
      q.includes('product') ||
      q.includes('wholesale') ||
      q.includes('d2c') ||
      q.includes('source') ||
      q.includes('supplier')
    ) {
      return 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=600&q=80';
    }

    // Marketing/Sales/Growth/SEO
    if (
      q.includes('marketing') ||
      q.includes('growth') ||
      q.includes('sales') ||
      q.includes('seo') ||
      q.includes('advertising') ||
      q.includes('social') ||
      q.includes('niche')
    ) {
      return 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80';
    }

    // Technology/AI/Software/App
    if (
      q.includes('ai') ||
      q.includes('software') ||
      q.includes('app') ||
      q.includes('tech') ||
      q.includes('technology') ||
      q.includes('code') ||
      q.includes('saas') ||
      q.includes('developer')
    ) {
      return 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80';
    }

    // Default business startup fallback
    return 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80';
  }

  /**
   * Performs real-time web search and returns verified sources and a relevant image.
   */
  async searchWeb(rawQuery: string): Promise<SearchResult> {
    const cleanQuery = this.cleanQuery(rawQuery);
    logger.debug(`[SearchService] Searching web for: "${cleanQuery}" (raw: "${rawQuery}")`);

    const sources: SearchSource[] = [];
    let imageUrl: string | undefined = undefined;

    // 1. Query Wikipedia Full-text Search
    try {
      const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&utf8=&format=json`;
      const searchResult = await this.getJson<any>(wikiSearchUrl);
      if (searchResult && searchResult.query && searchResult.query.search) {
        const searchItems = searchResult.query.search.slice(0, 3);
        for (const item of searchItems) {
          const title = item.title;
          const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
          sources.push({ title, url: pageUrl });
        }

        // Query page images for the top 3 results until we find a thumbnail
        for (const item of searchItems) {
          const imgUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(item.title)}&prop=pageimages&format=json&pithumbsize=500`;
          const imgResult = await this.getJson<any>(imgUrl);
          if (imgResult && imgResult.query && imgResult.query.pages) {
            const pages = imgResult.query.pages;
            for (const pageId in pages) {
              const page = pages[pageId];
              if (page.thumbnail && page.thumbnail.source) {
                imageUrl = page.thumbnail.source;
                logger.debug(`[SearchService] Found Wikipedia image: ${imageUrl}`);
                break;
              }
            }
          }
          if (imageUrl) break;
        }
      }
    } catch (err) {
      logger.warn(`[SearchService] Wikipedia search error: ${(err as Error).message}`);
    }

    // 2. Query DuckDuckGo Instant Answer API (as fallback and for images/extra sources)
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1`;
      const ddgResult = await this.getJson<any>(ddgUrl);
      if (ddgResult) {
        if (ddgResult.AbstractURL && !sources.some(s => s.url === ddgResult.AbstractURL)) {
          sources.unshift({ title: ddgResult.Heading || cleanQuery, url: ddgResult.AbstractURL });
        }
        if (!imageUrl && ddgResult.Image) {
          imageUrl = ddgResult.Image.startsWith('http') 
            ? ddgResult.Image 
            : `https://duckduckgo.com${ddgResult.Image}`;
          logger.debug(`[SearchService] Found DuckDuckGo image: ${imageUrl}`);
        }
      }
    } catch (err) {
      logger.warn(`[SearchService] DDG search error: ${(err as Error).message}`);
    }

    // 3. Fallback Image if no image was found from real search results
    if (!imageUrl) {
      imageUrl = this.getFallbackImage(cleanQuery);
      logger.debug(`[SearchService] Using fallback category image: ${imageUrl}`);
    }

    return {
      sources: sources.slice(0, 4),
      imageUrl
    };
  }
}
