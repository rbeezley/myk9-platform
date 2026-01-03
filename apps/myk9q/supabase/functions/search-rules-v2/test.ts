/**
 * Test file for the search-rules Edge Function
 * Run with: deno run --allow-net --allow-env test.ts
 */

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || "http://localhost:54321";
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_ANON_KEY") || "your-anon-key";

// Test queries
const testQueries = [
  {
    name: "Area size query with level and element",
    query: "what is the area size for exterior advanced?",
  },
  {
    name: "Hides query",
    query: "how many hides in master buried?",
  },
  {
    name: "Time limit query",
    query: "time limit for novice container",
  },
  {
    name: "General equipment query",
    query: "can I use a retractable leash?",
  },
  {
    name: "Requirements query",
    query: "what are the requirements for interior excellent?",
  },
];

async function testQuery(query: string) {
  console.log(`\n🔍 Testing: "${query}"`);
  console.log("─".repeat(80));

  const startTime = Date.now();

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/search-rules`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Error (${response.status}):`, error);
      return;
    }

    const data = await response.json();

    console.log(`✅ Success (${elapsed}ms)`);
    console.log("\n📊 Analysis:");
    console.log(`   Search Terms: "${data.analysis.searchTerms}"`);
    console.log(`   Level Filter: ${data.analysis.filters.level || "none"}`);
    console.log(`   Element Filter: ${data.analysis.filters.element || "none"}`);
    console.log(`   Intent: ${data.analysis.intent}`);

    console.log(`\n📚 Results (${data.count}):`);
    data.results.forEach((rule: any, idx: number) => {
      console.log(`\n   ${idx + 1}. ${rule.title}`);
      console.log(`      Section: ${rule.section}`);
      console.log(`      Level: ${rule.categories?.level || "General"}`);
      console.log(`      Element: ${rule.categories?.element || "All"}`);
      if (Object.keys(rule.measurements || {}).length > 0) {
        console.log(`      Measurements:`, JSON.stringify(rule.measurements));
      }
      console.log(`      Content: ${rule.content.substring(0, 150)}...`);
    });
  } catch (error) {
    console.error(`❌ Network error:`, error.message);
  }
}

async function runTests() {
  console.log("🚀 Starting Edge Function Tests");
  console.log("=".repeat(80));
  console.log(`   Endpoint: ${SUPABASE_URL}/functions/v1/search-rules`);
  console.log("=".repeat(80));

  for (const test of testQueries) {
    await testQuery(test.query);
    // Wait a bit between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ All tests complete!");
  console.log("=".repeat(80));
}

// Run tests
runTests();
