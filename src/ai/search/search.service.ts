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
   * Scrapes google.com image search results for the given query.
   * Returns only image URLs hosted on google.com (domain-rewritten from gstatic if cached).
   */
  private async scrapeGoogleImages(query: string): Promise<string[]> {
    try {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) return [];
      const html = await res.text();

      const urls: string[] = [];
      const regexes = [
        /https:\/\/encrypted-tbn\d\.gstatic\.com\/images\?q=tbn:[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+/g,
        /https:\/\/encrypted-tbn\d\.gstatic\.com\/images\?q=tbn:[a-zA-Z0-9_\-]+/g,
        /https:\/\/www\.google\.com\/images\?q=tbn:[a-zA-Z0-9_\-]+/g
      ];

      for (const regex of regexes) {
        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(html)) !== null) {
          const matchedUrl = match[0];
          if (!urls.includes(matchedUrl)) {
            urls.push(matchedUrl);
          }
        }
      }

      // Try finding img tag src attributes as well
      const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(html)) !== null) {
        const src = imgMatch[1];
        if (src.includes('google.com') || src.includes('gstatic.com')) {
          if (!urls.includes(src)) {
            urls.push(src);
          }
        }
      }

      // Convert all matching URLs to google.com domain and filter out other domains
      const googleUrls = urls
        .map(u => {
          let cleaned = u;
          if (cleaned.startsWith('/')) {
            cleaned = `https://www.google.com${cleaned}`;
          }
          // Rewrite gstatic to google.com
          cleaned = cleaned.replace(/https:\/\/encrypted-tbn\d\.gstatic\.com/, 'https://www.google.com');
          return cleaned;
        })
        .filter(u => u.startsWith('https://www.google.com/') || u.startsWith('https://google.com/'));

      return googleUrls;
    } catch (e) {
      logger.warn(`[SearchService] Google image scraping error: ${(e as Error).message}`);
      return [];
    }
  }

  /**
   * Performs real-time web search and returns verified sources and a relevant image.
   */
  async searchWeb(rawQuery: string): Promise<SearchResult> {
    const cleanQuery = this.cleanQuery(rawQuery);
    logger.debug(`[SearchService] Searching web for: "${cleanQuery}" (raw: "${rawQuery}")`);

    const sources: SearchSource[] = [];
    let imageUrl: string | undefined = undefined;

    // 1. Query Wikipedia Full-text Search (Sources only)
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
      }
    } catch (err) {
      logger.warn(`[SearchService] Wikipedia search error: ${(err as Error).message}`);
    }

    // 2. Query DuckDuckGo Instant Answer API (Sources only)
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1`;
      const ddgResult = await this.getJson<any>(ddgUrl);
      if (ddgResult) {
        if (ddgResult.AbstractURL && !sources.some(s => s.url === ddgResult.AbstractURL)) {
          sources.unshift({ title: ddgResult.Heading || cleanQuery, url: ddgResult.AbstractURL });
        }
      }
    } catch (err) {
      logger.warn(`[SearchService] DDG search error: ${(err as Error).message}`);
    }

    // 3. Scrape image strictly from google.com only
    try {
      const googleImages = await this.scrapeGoogleImages(cleanQuery);
      if (googleImages.length > 0) {
        imageUrl = googleImages[0];
        logger.debug(`[SearchService] Found Google scraped image: ${imageUrl}`);
      } else {
        logger.debug(`[SearchService] No Google images scraped for query "${cleanQuery}"`);
      }
    } catch (err) {
      logger.warn(`[SearchService] Google image search/scraping error: ${(err as Error).message}`);
    }

    return {
      sources: sources.slice(0, 4),
      imageUrl
    };
  }
}
