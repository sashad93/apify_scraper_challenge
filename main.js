const Apify = require('apify');
const util = require('util');
const fs= require("fs");
const path= require("path")
const moment=require("moment");

Apify.main(async () => {

    // Get queue and enqueue first url.
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest(new Apify.Request({ url: 'https://www.visithoustontexas.com/events/' }));

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        // Parameter page is Puppeteers page object with loaded page.
        handlePageFunction: async ({request, page})=>{
            if (request.url==='https://www.visithoustontexas.com/events/'){
                //adds all requests to qeueu for first page only.
                let links = await getEventLinks({request, page})
                for (let x=0; x<links.length; x++){
                    await requestQueue.addRequest(new Apify.Request(links[x]))
                }
            }
            else {
                //get event data, for all other pages
                await getEventData({request, page})
            }
        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });

    // Run crawler.
    await crawler.run();
    
});

function extractLinks(elements){
    let events=[]
    for (let x=0; x<elements.length; x++){
        events.push({url: elements[x].href})
    }
    return events;
}

const getEventLinks = async ({page, request})=>{
    let links=[]
    let nextButton= await page.$('div.paging a.arrow.next:not(.disabled)')
    while (nextButton){
        let events=await page.$$eval('li.eventItem.item > div.item-int > div.image > a:not([class])', extractLinks)
        // console.log("events",events)
        links=links.concat(events)
        // console.log("links", links)
        await nextButton.click();
        await page.waitForSelector("div.eventPagerBottom a.arrow.next", {visible: true})
        await page.waitFor(2000)
        nextButton= await page.$('div.paging a.arrow.next:not(.disabled)')
    }
    console.log("Logging all links collected: ", links);
    return links;
}

function pageFunction(element, field){
    switch(field){
        case "description":
            return element.innerText
        case "date":{
            return {date: element[0].innerText, recurring: element[1]? element[1].innerText: false};
        }

        case "place":{
            let address=element.innerText
            address=address.split("|")
            address=[address[0].trim()].concat(address[1].trim().split(","));
            address=address.slice(0, 2).concat(address[2].trim().split(" "));
            return {street: address[0], city: address[1], state: address[2], postal: address[3]}
        }
        case "block":{
            let block={details: {}}
            for (let x=0; x<element.length; x++){
                let text=element[x].innerText;
                if (text.indexOf("Time")!==-1){
                    block.time=text.slice(text.indexOf(":")+1).trim()
                }
                else if (text.indexOf("Contact")!==-1){
                    block.details.contact=text.split(":")[1].trim();
                }
                else if (text.indexOf("Phone")!==-1){
                    block.details.phone=text.split(":")[1].trim();
                }
                else if (text.indexOf("Admission")!==-1){
                    block.details.admission=text.split(":")[1].trim();
                }
            }
            return block
        }
    }
}

const getEventData = async ({ page, request}) => {
    console.log("start of handle page")
    // Function to get data from page
    const title = await page.title();
    const date = await page.$$eval('.dates', pageFunction, "date");
    const url= request.url
    const description = await page.$eval('.description', pageFunction, "description")
    const place=await page.$eval('.adrs', pageFunction, "place")
    const block= await page.$$eval('.detail-c2 > div:not([class])', pageFunction, "block")
    const timestamp=new Date().toUTCString()
    let event= {title, ...date, url, description, ...block, place, timestamp}
    console.log("EVENT",event)
    //for writing data to files, if desired.
    // fs.writeFile(path.join(__dirname, "events_scraped",`visithouston${request.id}.json`), JSON.stringify(event), "utf8", (error)=>{
    //     console.log("File written.", error)
    // })

    console.log(`Page ${request.url} succeeded and it has ${date.length} posts.`);


    // Log data (util is a tool that nicely formats objects in the console)
    console.log(util.inspect(title, false, null));
}


//not used
function parseDate(date, recurring, time){
    date=date.split("-");
    time=time.split("to")
    const start=moment(date[0].trim()+" "+time[0].trim())
    const end=moment(date[1].trim()+" "+ time[1].trim())
    if (recurring.indexOf("daily")!==-1){
        let range=[]
        let current=start
        while (current.isBefore(end)){
            range.push({startDate:moment(current).format("YYYY-MM-DDTHH:mm:ss"), endDate: moment(current.format("YYYY-MM-DD")+" "+time[1]).format("YYYY-MM-DDTHH:mm:ss")})
            current.add(1, "days")
        }
        return range;
    }
    else if (recurring.indexOf("weekly")!==-1){
        let range=[]
        let current=start
        while (current.isBefore(end)){
            range.push({startDate:moment(current).format("YYYY-MM-DDTHH:mm:ss"), endDate: moment(current.format("YYYY-MM-DD")+" "+time[1]).format("YYYY-MM-DDTHH:mm:ss")})
            current.add(7, "days")
        }
        return range
    }
    else {
        return {startDate:moment(start).format("YYYY-MM-DDTHH:mm:ss"), endDate: moment(end).format("YYYY-MM-DDTHH:mm:ss")}
    }
}
