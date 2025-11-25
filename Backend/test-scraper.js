import { scrapeLightweight } from './scrapers/newsOutletScraper.js';

// Test the scraper with verbose logging
console.log('🧪 Testing News Outlet Scraper\n');

const outletName = process.argv[2] || 'The Hindu';
const maxAuthors = parseInt(process.argv[3]) || 10;

console.log(`Testing: ${outletName}`);
console.log(`Target: ${maxAuthors} authors\n`);

try {
  const result = await scrapeLightweight(outletName, maxAuthors);
  
  console.log('\n📊 FINAL RESULT:');
  console.log(`   Outlet: ${result.outlet}`);
  console.log(`   Website: ${result.website}`);
  console.log(`   Authors Found: ${result.authorsCount}`);
  console.log(`   Authors Array Length: ${result.authors?.length || 0}`);
  
  if (result.authors && result.authors.length > 0) {
    console.log('\n👥 Sample Authors:');
    result.authors.slice(0, 5).forEach((author, i) => {
      console.log(`   ${i + 1}. ${author.name}`);
      console.log(`      - Outlet: ${author.outlet}`);
      console.log(`      - Articles: ${author.totalArticles}`);
      console.log(`      - Topics: ${author.publicationTopics?.join(', ') || author.topics?.join(', ') || 'N/A'}`);
      console.log(`      - Profile: ${author.profileUrl}`);
    });
  } else {
    console.log('\n❌ NO AUTHORS FOUND!');
    console.log('   This might indicate:');
    console.log('   1. Website blocks scraping');
    console.log('   2. Selectors don\'t match website structure');
    console.log('   3. Validation is too strict');
    console.log('   4. Articles don\'t have bylines');
  }
  
  process.exit(0);
} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
}
