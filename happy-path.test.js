const puppeteer = require('puppeteer');
const assert = require('assert');

const email = 'foo@email.com';
const password = '123456';

const closeWhenDone = !process.env.DO_NOT_CLOSE;
console.log("Keep open: ", !closeWhenDone);
// puppeteer.launch().then(async browser => {
puppeteer.launch(closeWhenDone ? {headless: true} : {headless: false}).then(async browser => {

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
  if (closeWhenDone) {
    await browser.close();
  }
});


//Common utilities
async function resetServerData(page) {
  //Clear all DB data
  await page.evaluate(async ()=>{
    await window.lc.resetServerDBState();
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
let lastSeenClientData;
async function getClientData(page) {
  //Clear all DB data
  lastSeenClientData = await page.evaluate(async function() {
    return window.lc.data;
  });
  return lastSeenClientData;
}
async function wclick(page, selector) {
  await page.waitForSelector(selector);
  await page.click(selector);
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

      await page.waitForSelector('#display-name');
      await page.type('#email', email);
      await page.type('#password', password);
      await page.type('#password-repeat', password);
      await page.type('#display-name', 'foo');
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
      await wclick(page, '#remove-card-button-active');
      await page.click('#add-card');
      // Making it messy
      const clientData = await waitForChangesToSave(page);
      //We allow removal after creation of a second card
      const activeCardId = clientData.activeCardId;
      assert(activeCardId, 'Selected a card');
      assert(clientData.deck.cards.length === 2, 'Now there are more cards in the deck');
      assert(clientData.deck.cards[1] === activeCardId, 'Updates active card to new card');
      assert(clientData.deck.cards[0] !== activeCardId, 'has a distinct id');
      assert(clientData.cardBody[activeCardId], 'Created a card body');
      const serverData = await getUserServerData(page);
      assert.equal(serverData.deck[0].cards, clientData.deck.cards, 'Deck cards match up with server cards');
      const cardBodyOnServer = serverData.cardBody.find(cb => cb.id === activeCardId);
      assert.ok(cardBodyOnServer, 'cardBody matches up with server cardBody');
      assert(serverData.cardBody.length === 2, 'Made a card body for each new card');
    },
  },
  {
    n: "Card Removal & subsequent creation",
    t: async (page) => {
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
  {
    n: "Edit cards + image",
    t: async (page) => {
      await page.focus('.pell-content');
      await page.keyboard.type('Hello!');
      await page.click('#flip-card');
      await page.focus('.pell-content');
      await page.keyboard.type('Sailor!');
      const input = await page.$('#image-upload');
      await input.uploadFile('./test-image.png');
      let clientData = await waitForChangesToSave(page);
      let serverData =  await getUserServerData(page);
      let activeId = clientData.activeCardId;
      let cardBody = serverData.cardBody.find(cb => cb.id === activeId);
      assert(cardBody.backHasImage);
      assert(!!cardBody.backImage);
      assert(cardBody.back.indexOf('Sailor!') !== -1);
      assert(cardBody.front.indexOf('Hello!') !== -1);
      assert(!cardBody.frontHasImage);
      assert(!cardBody.frontImage);
      await page.click('#image-spot');
      await page.waitForSelector('#popup-image');
      await page.click('.popup');
      await page.waitFor(() => !document.querySelector("#overlay"));
      await page.click('#flip-card');
      await page.waitForSelector('.image-spot-without-image');
      await page.click('#flip-card');
      await page.waitForSelector('#remove-image-from-card');
      await page.click('#remove-image-from-card');
      await waitForChangesToSave(page);
      serverData = await getUserServerData(page);
      cardBody = serverData.cardBody.find(cb => cb.id === activeId)
      // //Removed image
      assert(!cardBody.backHasImage);
      assert(!cardBody.backImage);
    },
  }, {
    n: "Study cards",
    t: async (page) => {
      await page.click('#no-study-session-creation-button');
      await wclick(page, '#flip-card-study');
      await wclick(page, '#right-button');
      await waitForChangesToSave(page);
      await page.click('#flip-card-study');
      await wclick(page, '#wrong-button');
      //restudy the wrong answers
      await wclick(page, '#restudy-button');
      await waitForChangesToSave(page);
      await wclick(page, '#flip-card-study');
      await wclick(page, '#right-button');
      //finish study session
      await wclick(page, '#finish-studying');
    },
  },
    //
  {
    n: "Deck sharing",
    t: async (page) => {
      //Share deck
      await wclick(page, '.deck-edit-button');
      let once;
      const dialogPromise = new Promise(resolve => {
        page.on('dialog', async dialog => {
          if(once) return;
          once = true;
          await dialog.accept();
          resolve();
        });
      });
      await wclick(page, '#share-deck-button');
      await dialogPromise;
      //Now sharable
      await waitForChangesToSave(page);
      await page.waitForSelector('#copy-sharable-link');
    },
  },
  {
    n: "Logout",
    t: async (page) => {
      await wclick(page, '#logout-link');
    }
  },
  {
    n: "Public deck viewable by another",
    t: async (page) => {
      //Create another user
      await wclick(page, '#login-button');
      await wclick(page, '#signup-button');
      await page.waitForSelector('#display-name');
      await page.type('#email', email + '1');
      await page.type('#password', password);
      await page.type('#password-repeat', password);
      await page.type('#display-name', 'foo2');
      await page.click('#signup-button');
      await page.waitForNavigation();
      //Try to view shareable link
      const deckId = lastSeenClientData.deck.id;
      await page.goto(`http://localhost:3000/site/me/study?deck=${deckId}&upsert=true`);
      // On page
      await page.waitForSelector('#end-session-link');
      const data = await getClientData(page);
      assert(data.deck.id === deckId);
      assert(data.deck.cards.length === 2);
      let once;
      const dialogPromise = new Promise(resolve => {
        page.on('dialog', async dialog => {
          if(once) return;
          once = true;
          await dialog.accept();
          resolve();
        });
      });
      await page.click('#end-session-link');
      await dialogPromise;
      //Fix bug with study history preview!

    },
  },
];
