const puppeteer = require('puppeteer');
const assert = require('assert');

// puppeteer.launch().then(async browser => {
puppeteer.launch({headless: false}).then(async browser => {

  const page = await browser.newPage();
  //Keep it fast
  page.setDefaultTimeout(500);
  //Begin on home page
  await page.goto('http://localhost:3000/');
  //Page render
  await page.waitForSelector('#app-header');

  page.once('load', () => console.log('Page loaded!'));
  page.once('framenavigated', () => console.log('Page navigated!'));

  await resetServerData(page);

  for(let i = 0; i < tests.length; i++) {
    let testConfig = tests[i];
    console.log("Running Test: ", testConfig.n);
    try {
      await testConfig.t(page);
    } catch(e) {
      console.log('\x1b[33m%s\x1b[0m', `Test: ${testConfig.n} failed!`);  //yellow
      console.error(e);
      break;
    }
  }
  // await browser.close();
});


//Common utilities
async function resetServerData(page) {
  //Clear all DB data
  await page.evaluate(async ()=>{
    await window.lc.resetServerDBState();
  });
}
async function getServerData(page) {
  //Clear all DB data
  return page.evaluate(async function() {
    const val = await window.lc.getServerDBState();
    console.log(val);
    return val;
  });
}
async function getClientData(page) {
  //Clear all DB data
  return page.evaluate(async function() {
    return window.lc.data;
  });
}

async function signup(page, email, password) {
  //Begin on login page
  await page.goto('http://localhost:3000/site/login');
  //Page render
  await page.waitForSelector('#email');
  //Navigate to signup page
  await page.click('#signup-button');

  await page.waitForSelector('#email');
  await page.type('#email', email);
  await page.type('#password', password);
  await page.type('#password-repeat', password);
  //Complete signup
  await page.click('#signup-button');
  await page.waitForNavigation();
}



const tests = [
  {
    n: "Signup Flow",
    t: async (page) => {
      await signup(page, 'foo@email.com', '123456');
      assert(page.url() === 'http://localhost:3000/site/me', 'failed to navigate to home');
    }
  },
  {
    n: "Authenticate Email",
    t: async (page) => {
      await page.waitForSelector('#email-verification-bar');
      const data = await getServerData(page);
      const emailBody = data.emails[0].text;
      const url = emailBody.substring(emailBody.indexOf('http:'));
      await page.goto(url);
      await page.waitForSelector('#email-verified');

    }
  }
];
