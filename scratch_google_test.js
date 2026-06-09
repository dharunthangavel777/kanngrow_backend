async function testScrape(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`;
  console.log('Fetching:', url);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    console.log('HTML length:', html.length);
    
    // Find all img tags src attributes
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/g;
    let match;
    const urls = [];
    while ((match = imgRegex.exec(html)) !== null) {
      urls.push(match[1]);
    }
    console.log('Total img srcs found:', urls.length);
    console.log('First 10 urls:', urls.slice(0, 10));

    // Let's filter for google.com or gstatic.com
    const googleUrls = urls.filter(u => u.includes('google.com') || u.includes('gstatic.com'));
    console.log('Google/Gstatic urls count:', googleUrls.length);
    console.log('Google/Gstatic urls:', googleUrls.slice(0, 10));
  } catch (e) {
    console.error('Error:', e);
  }
}

testScrape('Google related product');
