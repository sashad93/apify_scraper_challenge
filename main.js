const Apify = require('apify');
const util = require('util');


Apify.main(async () => {

    // Get queue and enqueue first url.
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest(new Apify.Request({ url: 'https://news.ycombinator.com/' }));

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,

        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        // Parameter page is Puppeteers page object with loaded page.
        handlePageFunction: getEventData,

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });

    // Run crawler.
    await crawler.run();
    
});



const getEventData = async ({ page, request }) => {

    // Function to get data from page
    const title = await page.title();
    const posts = await page.$$('.athing');

    console.log(`Page ${request.url} succeeded and it has ${posts.length} posts.`);


    // Log data (util is a tool that nicely formats objects in the console)
    console.log(util.inspect(title, false, null));
}


