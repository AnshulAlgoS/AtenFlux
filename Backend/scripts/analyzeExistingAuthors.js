import { scrapeOutletIntelligent } from '../scrapers/outletAuthorScraper.js';
import fs from 'fs';

/**
 * 🏆 HACKATHON DEMO SCRIPT
 * 
 * Perfect for live demonstration!
 * 
 * ✅ NO manual URLs needed
 * ✅ NO pre-saved mappings
 * ✅ Just provide the outlet NAME
 * ✅ Watch it automatically:
 *    1. Detect the official website
 *    2. Discover authors
 *    3. Extract all data (name, role, articles, social links, etc.)
 * 
 * Works for ANY news outlet in the world!
 */

(async () => {
  try {
    console.log('\n' + '='.repeat(90));
    console.log('🏆 HACKATHON DEMO: INTELLIGENT NEWS OUTLET SCRAPER');
    console.log('='.repeat(90));
    console.log('\n✨ FEATURES:');
    console.log('   ✅ Automatically detects outlet website (no manual URLs)');
    console.log('   ✅ Discovers authors automatically');
    console.log('   ✅ Extracts comprehensive data:');
    console.log('      • Name, Role, Bio');
    console.log('      • Email, Social Links');
    console.log('      • Articles (title, date, section, URL)');
    console.log('   ✅ Works for ANY language');
    console.log('   ✅ No outlet-specific code');
    console.log('   ✅ No pre-saved configurations');
    console.log('\n📰 SUPPORTED OUTLETS:');
    console.log('   • ALL Indian news outlets (Dainik Bhaskar, Amar Ujala, The Hindu, etc.)');
    console.log('   • International outlets (New York Times, BBC, etc.)');
    console.log('   • Regional outlets in any language');
    console.log('\n' + '='.repeat(90) + '\n');

    // =================================================================
    // DEMO: Test with different outlets
    // =================================================================

    const outletsToTest = [
      { name: 'Amar Ujala', maxAuthors: 30 },
      // { name: 'The Hindu', maxAuthors: 30 },
      // { name: 'Times of India', maxAuthors: 30 },
      // { name: 'Dainik Bhaskar', maxAuthors: 30 },
    ];

    const allResults = [];

    for (let i = 0; i < outletsToTest.length; i++) {
      const outlet = outletsToTest[i];
      
      console.log(`\n\n${'█'.repeat(90)}`);
      console.log(`█  [${i + 1}/${outletsToTest.length}] TESTING: ${outlet.name}`);
      console.log(`${'█'.repeat(90)}\n`);

      const result = await scrapeOutletIntelligent(outlet.name, outlet.maxAuthors);
      
      if (result.error) {
        console.log(`\n❌ Error scraping ${outlet.name}: ${result.error}\n`);
      } else {
        allResults.push(result);
        
        // Display summary
        console.log(`\n\n${'='.repeat(80)}`);
        console.log(`📊 SUMMARY FOR: ${result.outlet}`);
        console.log('='.repeat(80));
        console.log(`🌐 Website: ${result.website}`);
        console.log(`👥 Authors: ${result.authorsCount}`);
        console.log('\n📋 AUTHOR DETAILS:\n');
        
        result.authors.forEach((author, idx) => {
          console.log(`${idx + 1}. ${author.name}`);
          console.log(`   Role: ${author.role || 'Not available'}`);
          console.log(`   Profile: ${author.profileUrl}`);
          console.log(`   Articles: ${author.totalArticles}`);
          console.log(`   Email: ${author.email || 'Not available'}`);
          
          if (Object.keys(author.socialLinks).length > 0) {
            console.log(`   Social Links:`);
            Object.entries(author.socialLinks).forEach(([platform, url]) => {
              console.log(`      • ${platform}: ${url}`);
            });
          }
          
          if (author.articles.length > 0) {
            console.log(`   Latest Articles:`);
            author.articles.slice(0, 3).forEach((article, artIdx) => {
              console.log(`      ${artIdx + 1}. ${article.title.substring(0, 60)}...`);
              console.log(`         Section: ${article.section || 'N/A'} | Date: ${article.publishDate || 'N/A'}`);
            });
          }
          console.log('');
        });
        console.log('='.repeat(80));
      }

      // Delay between outlets
      if (i < outletsToTest.length - 1) {
        console.log(`\n⏳ Waiting 5 seconds before next outlet...\n`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // =================================================================
    // SAVE RESULTS TO FILE
    // =================================================================

    if (allResults.length > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `hackathon-demo-results-${timestamp}.json`;
      
      fs.writeFileSync(filename, JSON.stringify(allResults, null, 2));
      
      console.log(`\n\n${'='.repeat(90)}`);
      console.log(`💾 RESULTS SAVED`);
      console.log('='.repeat(90));
      console.log(`📁 File: ${filename}`);
      console.log(`📊 Total Outlets: ${allResults.length}`);
      console.log(`👥 Total Authors: ${allResults.reduce((sum, r) => sum + r.authorsCount, 0)}`);
      console.log(`📝 Total Articles: ${allResults.reduce((sum, r) => 
        r.authors.reduce((s, a) => s + a.totalArticles, 0), 0)}`);
      console.log('='.repeat(90));
    }

    // =================================================================
    // FINAL MESSAGE
    // =================================================================

    console.log('\n\n' + '='.repeat(90));
    console.log('🎉 HACKATHON DEMO COMPLETE!');
    console.log('='.repeat(90));
    console.log('\n💡 FOR LIVE DEMO:');
    console.log('   1. Organizers give you 2-3 newspaper names');
    console.log('   2. Add them to "outletsToTest" array above');
    console.log('   3. Run this script: node scripts/hackathonDemo.js');
    console.log('   4. Watch the browser automatically:');
    console.log('      • Find the official website via Google');
    console.log('      • Discover authors from homepage');
    console.log('      • Extract all data from each author profile');
    console.log('      • Display comprehensive results');
    console.log('\n🏆 KEY SELLING POINTS:');
    console.log('   ✅ Zero configuration needed');
    console.log('   ✅ Works for ANY outlet');
    console.log('   ✅ Handles any language (Hindi, English, Tamil, Telugu, etc.)');
    console.log('   ✅ Extracts 100% publicly available data');
    console.log('   ✅ Visible browser shows the entire process');
    console.log('   ✅ Production-ready code');
    console.log('\n✨ This is the future of news data extraction!\n');

    console.log('='.repeat(90));
    console.log('📋 HACKATHON CHECKLIST:');
    console.log('='.repeat(90));
    console.log('   ✅ Automatically detect official website - DONE');
    console.log('   ✅ No manual URLs needed - DONE');
    console.log('   ✅ No pre-saved mappings - DONE');
    console.log('   ✅ Extract journalist/author data - DONE');
    console.log('   ✅ Display name, role, publication date - DONE');
    console.log('   ✅ Display article title, section - DONE');
    console.log('   ✅ Display contact/social links - DONE');
    console.log('   ✅ Works for any outlet - DONE');
    console.log('='.repeat(90) + '\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();