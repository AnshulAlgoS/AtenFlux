import { scrapeLightweight } from './scrapers/newsOutletScraper.js';

// Test the scraper with verbose logging
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║       🧪 AtenFlux News Outlet Scraper - Test Suite       ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const outletName = process.argv[2] || 'The Hindu';
const maxAuthors = parseInt(process.argv[3]) || 10;

console.log(`📰 Testing Outlet: "${outletName}"`);
console.log(`🎯 Target: ${maxAuthors} authors`);
console.log(`🔧 Mode: Full autonomous (DuckDuckGo search only, no guessing)\n`);
console.log('─'.repeat(60));

const startTime = Date.now();

try {
  const result = await scrapeLightweight(outletName, maxAuthors);
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n' + '═'.repeat(60));
  console.log('📊 FINAL RESULTS');
  console.log('═'.repeat(60));
  console.log(`⏱️  Duration: ${duration}s`);
  console.log(`📰 Outlet: ${result.outlet}`);
  console.log(`🌐 Website: ${result.website}`);
  console.log(`👥 Authors Found: ${result.authorsCount}`);
  console.log(`📝 Authors with Data: ${result.authors?.length || 0}`);
  
  if (result.authors && result.authors.length > 0) {
    const withArticles = result.authors.filter(a => a.totalArticles > 0).length;
    const totalArticles = result.authors.reduce((sum, a) => sum + a.totalArticles, 0);
    const avgArticles = (totalArticles / result.authors.length).toFixed(1);
    
    console.log(` Total Articles: ${totalArticles}`);
    console.log(` Avg Articles/Author: ${avgArticles}`);
    console.log(` Authors with Articles: ${withArticles}/${result.authors.length}`);
    
    // Topic distribution
    const topicCounts = {};
    result.authors.forEach(author => {
      const topics = author.publicationTopics || author.topics || [];
      topics.forEach(topic => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      });
    });
    
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => `${topic}(${count})`)
      .join(', ');
    
    console.log(`📚 Top Topics: ${topTopics || 'N/A'}`);
    
    console.log('\n' + '─'.repeat(60));
    console.log('👥 SAMPLE AUTHORS:');
    console.log('─'.repeat(60));
    
    result.authors.slice(0, 5).forEach((author, i) => {
      console.log(`\n${i + 1}. ${author.name}`);
      console.log(`   Outlet: ${author.outlet}`);
      console.log(`   Role: ${author.role || 'Journalist'}`);
      console.log(`   Articles: ${author.totalArticles}`);
      console.log(`   Topics: ${author.publicationTopics?.join(', ') || author.topics?.join(', ') || 'General'}`);
      console.log(`   Keywords: ${author.topKeywords?.slice(0, 3).join(', ') || 'N/A'}`);
      console.log(`   Influence: ${author.influenceScore || 50}/100`);
      console.log(`   Profile: ${author.profileUrl}`);
    });
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ TEST PASSED - Scraper working correctly!');
    console.log('═'.repeat(60));
    
  } else {
    console.log('\n' + '═'.repeat(60));
    console.log('❌ TEST FAILED - NO AUTHORS FOUND!');
    console.log('═'.repeat(60));
    console.log('\n🔍 Possible Causes:');
    console.log('   1. ❌ Website uses JavaScript rendering (needs browser)');
    console.log('   2. ❌ Website blocks non-browser requests');
    console.log('   3. ❌ Articles use generic bylines (filtered out)');
    console.log('   4. ❌ Byline selectors don\'t match this outlet\'s HTML');
    console.log('   5. ❌ All author names failed validation');
    
    console.log('\n💡 Debugging Steps:');
    console.log('   1. Check logs above for "🧪 Validation Test" output');
    console.log('   2. Look for "JSON-LD scripts" and "Meta author tags" counts');
    console.log('   3. Check if any authors were found but rejected');
    console.log('   4. Try manually visiting: ' + result.website);
  }
  
  process.exit(result.authors?.length > 0 ? 0 : 1);
  
} catch (error) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n' + '═'.repeat(60));
  console.log('❌ TEST FAILED - ERROR');
  console.log('═'.repeat(60));
  console.log(`⏱️  Duration: ${duration}s`);
  console.log(`\n🔴 Error Type: ${error.name}`);
  console.log(`📝 Message: ${error.message}`);
  
  if (error.message.includes('No valid websites found')) {
    console.log('\n💡 This error means:');
    console.log('   - DuckDuckGo search returned no matching results');
    console.log('   - Or all results were filtered out (social media, wikis, etc.)');
    console.log('   - Or outlet name is misspelled');
    
    console.log('\n🔧 Try:');
    console.log(`   1. Check spelling: "${outletName}"`);
    console.log('   2. Use full official name');
    console.log('   3. Add "news" or "newspaper" to the name');
    console.log(`   4. Manual search: https://duckduckgo.com/?q=${encodeURIComponent(outletName + ' news india')}`);
  }
  
  console.log('\n🐛 Full Stack Trace:');
  console.log(error.stack);
  
  process.exit(1);
}
