const puppeteer = require('puppeteer');
const assert = require('assert');

const email = 'foo@email.com';
const password = '123456';

// puppeteer.launch().then(async browser => {
puppeteer.launch({headless: true}).then(async browser => {

  const page = await browser.newPage();
  //Begin on home page

  //Keep initial load fast
  page.setDefaultTimeout(500);

  await page.goto('http://localhost:3000/');
  //Page render
  await page.waitForSelector('#app-header');

  await resetServerData(page);
  //Second load should be much quicker
  page.setDefaultTimeout(200);

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
  await browser.close();
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

async function getUserServerData(page) {
  //Clear all DB data
  return page.evaluate(async function(userId) {
    const val = await window.lc.getServerDBState(userId);
    console.log(val);
    return val;
  }, email);
}

async function getClientData(page) {
  //Clear all DB data
  return page.evaluate(async function() {
    return window.lc.data;
  });
}
async function waitForChangesToSave(page) {
  const checks = 5;
  const waitTimePerCheck = 100;
  for(let i = 0; i < checks; i++) {
    const clientData = await getClientData(page);
    if(!clientData.changes || Object.keys(clientData.changes).length === 0) {
      return clientData;
    }
    await new Promise(resolve => {
      setTimeout(resolve, waitTimePerCheck);
    });
  }
  assert(false, 'Timed out on changes');
}


//Tests are intended to be run in order
const tests = [
  {
    n: "Signup Flow",
    t: async (page) => {
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
      assert(page.url() === 'http://localhost:3000/site/me', 'failed to navigate to home');
    }
  },
  {
    n: "Authenticate Email",
    t: async (page) => {
      await page.waitForSelector('#email-verification-bar');
      const data = await getUserServerData(page);
      const emailBody = data.emails[0].text;
      const url = emailBody.substring(emailBody.indexOf('http:'));
      await page.goto(url);
      await page.waitForSelector('#email-verified');
      assert(true, 'Verified email as expected');
    },
  },
  {
    n: "Deck Creation",
    t: async (page) => {
      await page.click('#add-deck-card');
      //We do not allow card removal for the only card
      await page.waitForSelector('#remove-card-button-inactive');
      const clientData = await waitForChangesToSave(page);
      const activeCardId = clientData.activeCardId;
      assert(activeCardId, 'Selected a card');
      assert(clientData.deck.cards.length === 1, 'is the only card in the deck');
      assert(clientData.deck.cards === activeCardId, 'is the only card in the deck');
      assert(clientData.cardBody[activeCardId], 'Created a card body');

    },
  },
  {
    n: "Card Creation",
    t: async (page) => {
      await page.click('#add-card');
      await page.click('#add-card');
      await page.waitForSelector('#remove-card-button-active');
      await page.click('#remove-card-button-active');
      await page.click('#remove-card-button-active');
      await page.click('#add-card');
      await page.click('#add-card');
      // Making it messy
      const clientData = await waitForChangesToSave(page);
      //We allow removal after creation of a second card
      const activeCardId = clientData.activeCardId;
      assert(activeCardId, 'Selected a card');
      assert(clientData.deck.cards.length === 3, 'Now there are more cards in the deck');
      assert(clientData.deck.cards[2] === activeCardId, 'Updates active card to new card');
      assert(clientData.deck.cards[0] !== activeCardId, 'has a distinct id');
      assert(clientData.deck.cards[1] !== activeCardId, 'has a distinct id');
      assert(clientData.deck.cards[1] !== clientData.deck.cards[0], 'has a distinct id');
      assert(clientData.cardBody[activeCardId], 'Created a card body');
      const serverData = await getUserServerData(page);
      assert.equal(serverData.deck[0].cards, clientData.deck.cards, 'Deck cards match up with server cards');
      const cardBodyOnServer = serverData.cardBody.find(cb => cb.id === activeCardId);
      assert.ok(cardBodyOnServer, 'cardBody matches up with server cardBody');
      assert(serverData.cardBody.length === 3, 'Made a card body for each new card');
    },
  },
  {
    n: "Card Removal & subsequent creation",
    t: async (page) => {
      await page.click('#remove-card-button-active');
      await page.click('#remove-card-button-active');
      let clientData = await waitForChangesToSave(page);
      //We allow removal after creation of a second card
      const activeCardId = clientData.activeCardId;
      assert(activeCardId, 'Selected a card');
      assert(clientData.deck.cards.length === 1, 'Now there are less cards in the deck');
      assert(clientData.deck.cards[0] === activeCardId, 'Selected previous card');
      let serverData = await getUserServerData(page);
      assert(serverData.deck[0].cards === clientData.deck.cards, 'Deck cards match up with server cards');
      assert(serverData.cardBody.length === 1, 'Removed a cardbody correctly');

      await page.click('#add-card');
      clientData = await waitForChangesToSave(page);
      serverData = await getUserServerData(page);
      assert(clientData.deck.cards.length === 2, 'Now there are more cards in the deck');
      assert(clientData.deck.cards[1] === String.fromCharCode(1), 'reclaimed open ID');
      assert(clientData.deck.cards[1] === String.fromCharCode(1), 'reclaimed open ID');
      assert.equal(serverData.deck[0].cards, clientData.deck.cards, 'Deck cards match up with server cards');
    },
  },
];
