// Test the pipeline steps individually to find bottlenecks
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "EutaKhabar/1.0" }
});

async function testRSS(name, url) {
  const start = Date.now();
  try {
    const feed = await parser.parseURL(url);
    const elapsed = Date.now() - start;
    console.log(`✓ ${name}: ${feed.items.length} items (${elapsed}ms)`);
    return feed.items.slice(0, 5).map(i => ({
      title: i.title?.slice(0, 80),
      url: i.link,
      image: i.enclosure?.url || null,
    }));
  } catch (e) {
    console.log(`✗ ${name}: ${e.message} (${Date.now() - start}ms)`);
    return [];
  }
}

async function testScrape(name, url) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "EutaKhabar/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const elapsed = Date.now() - start;
    // Count h2/h3 links roughly
    const links = (html.match(/<h[23][^>]*>.*?<a/gs) || []).length;
    console.log(`✓ ${name}: ~${links} headline links, ${(html.length/1024).toFixed(0)}KB (${elapsed}ms)`);
  } catch (e) {
    console.log(`✗ ${name}: ${e.message} (${Date.now() - start}ms)`);
  }
}

async function testClaude() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log("✗ Claude: No ANTHROPIC_API_KEY");
    return;
  }
  const start = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        messages: [{ role: "user", content: "Say 'API working' in 3 words" }],
      }),
    });
    const data = await res.json();
    const elapsed = Date.now() - start;
    if (data.content) {
      console.log(`✓ Claude API: "${data.content[0].text}" (${elapsed}ms)`);
    } else {
      console.log(`✗ Claude API: ${JSON.stringify(data.error || data)} (${elapsed}ms)`);
    }
  } catch (e) {
    console.log(`✗ Claude API: ${e.message} (${Date.now() - start}ms)`);
  }
}

console.log("=== Testing Pipeline Components ===\n");

// Test collectors in parallel
console.log("--- Collectors ---");
const [rss1, rss2, rss3] = await Promise.all([
  testRSS("Setopati", "https://setopati.com/feed"),
  testRSS("OnlineKhabar NE", "https://www.onlinekhabar.com/feed"),
  testRSS("OnlineKhabar EN", "https://english.onlinekhabar.com/feed"),
]);

await Promise.all([
  testScrape("eKantipur", "https://ekantipur.com"),
  testScrape("Himalayan Times", "https://thehimalayantimes.com"),
  testScrape("Kathmandu Post", "https://kathmandupost.com"),
  testScrape("Ukaalo", "https://www.ukaalo.com"),
]);

console.log("\n--- Claude API ---");
await testClaude();

// Show some sample items
console.log("\n--- Sample Headlines ---");
const all = [...rss1, ...rss2, ...rss3];
all.slice(0, 8).forEach((item, i) => {
  console.log(`[${i}] ${item.title}`);
  if (item.image) console.log(`    IMG: ${item.image}`);
});
