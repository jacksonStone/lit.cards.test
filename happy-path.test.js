/*global AP*/
/*global APC*/
/*global wait_for_save*/
/*global server_data*/
const puppeteer = require('puppeteer');
const assert = require('assert');

const email = 'foo@email.com';
const password = '123456';

const closeWhenDone = !process.env.DO_NOT_CLOSE;
console.log("Keep open: ", !closeWhenDone);

//AP. === await page.
//APC( === await wclick(page,
//wait_for_save; === await waitForChangesToSave(page);
//server_data; === await getUserServerData(page);

// puppeteer.launch().then(async browser => {
puppeteer.launch(closeWhenDone ? {headless: true} : {headless: false}).then(async browser => {

  const page = await browser.newPage();
  //Begin on home page

  //Keep initial load fast
  page.setDefaultTimeout(1000);

  AP.goto('http://localhost:3000/');
  //Page render
  AP.waitForSelector('#app-header');

  await resetServerData(page);
  //Second load should be much quicker
  // page.setDefaultTimeout(200);
  const now = Date.now();
  for(let testConfig of tests) {
    console.log("Running Test: ", testConfig.n);
    try {
      await testConfig.t(page);
    } catch(e) {
      console.log('\x1b[33m%s\x1b[0m', `Test: ${testConfig.n} failed!`);  //yellow
      console.error(e);
      break;
    }
  }
  const then = Date.now();
  console.log(`Tests took: ${(then - now)/1000} seconds`);
  if (closeWhenDone) {
    await browser.close();
  }
});


//Common utilities
async function resetServerData(page) {
  //Clear all DB data
  AP.evaluate(async ()=>{
    await window.lc.resetServerDBState();
  });
}

async function getUserServerData(page) {
  //Clear all DB data
  return page.evaluate(async function(userId) {
    const val = await window.lc.getServerDBState(userId);
    return val;
  }, email);
}
let lastSeenClientData;
async function getClientData(page) {
  //Clear all DB data
  lastSeenClientData = AP.evaluate(async function() {
    const clientData =  window.lc.data;
    if(!clientData.saving && !clientData.fileUploading && (!clientData.changes || Object.keys(clientData.changes).length === 0)) {
      console.log("Thinks no save left");
    }
    return  clientData;
  });
  return lastSeenClientData;
}
async function wclick(page, selector) {
  AP.waitForSelector(selector);
  AP.click(selector);
}
async function waitForChangesToSave(page) {
  const checks = 5;
  const waitTimePerCheck = 100;
  for(let i = 0; i < checks; i++) {
    const clientData = await getClientData(page);
    if(!clientData.saving && !clientData.fileUploading && (!clientData.changes || Object.keys(clientData.changes).length === 0)) {
      return clientData;
    }
    await new Promise(resolve => {
      setTimeout(resolve, waitTimePerCheck);
    });
  }
  assert(false, 'Timed out on changes');
}
async function waitForChangesToSaveFast(page) {
  const checks = 5;
  const waitTimePerCheck = 100;
  for(let i = 0; i < checks; i++) {
    const done = AP.evaluate(function() {
      const clientData =  window.lc.data;
      if(!clientData.saving && !clientData.fileUploading && (!clientData.changes || Object.keys(clientData.changes).length === 0)) {
        return true;
      }
      return  false;
    });
    if (done) return true;
    await new Promise(resolve => {
      setTimeout(resolve, waitTimePerCheck);
    });
  }
  assert(false, 'Save took too long by my standards');
}
async function clickAndWaitOnDialog(page, id) {
  let once;
  const dialogPromise = new Promise(resolve => {
    page.on('dialog', async dialog => {
      if(once) return;
      once = true;
      await dialog.accept();
      resolve();
    });
  });
  APC(id);
  await dialogPromise;
}

//Tests are intended to be run in order
const tests = [
  {
    n: "Signup Flow",
    t: async (page) => {
      //Begin on login page
      AP.goto('http://localhost:3000/site/login');
      //Page render
      AP.waitForSelector('#email');
      //Navigate to signup page
      AP.click('#signup-button');

      AP.waitForSelector('#display-name');
      AP.type('#email', email);
      AP.type('#password', password);
      AP.type('#password-repeat', password);
      AP.type('#display-name', 'foo');
      //Complete signup
      AP.click('#signup-button');
      AP.waitForNavigation();
      assert(page.url() === 'http://localhost:3000/site/me', 'failed to navigate to home');
    }
  },
  {
    n: "Authenticate Email",
    t: async (page) => {
      AP.waitForSelector('#email-verification-bar');
      const data = server_data;
      const emailBody = data.emails[0].text;
      const url = emailBody.substring(emailBody.indexOf('http:'));
      AP.goto(url);
      AP.waitForSelector('#email-verified');
      assert(true, 'Verified email as expected');
    },
  },
  {
    n: "Deck Creation",
    t: async (page) => {
      AP.click('#add-deck-card');
      //We do not allow card removal for the only card
      AP.waitForSelector('#remove-card-button-inactive');
      const clientData = wait_for_save;
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
      AP.click('#add-card');
      APC('#remove-card-button-active');
      AP.click('#add-card');
      // Making it messy
      const clientData = wait_for_save;
      //We allow removal after creation of a second card
      const activeCardId = clientData.activeCardId;
      assert(activeCardId, 'Selected a card');
      assert(clientData.deck.cards.length === 2, 'Now there are more cards in the deck');
      assert(clientData.deck.cards[1] === activeCardId, 'Updates active card to new card');
      assert(clientData.deck.cards[0] !== activeCardId, 'has a distinct id');
      assert(clientData.cardBody[activeCardId], 'Created a card body');
      const serverData = server_data;
      assert.equal(serverData.deck[0].cards, clientData.deck.cards, 'Deck cards match up with server cards');
      const cardBodyOnServer = serverData.cardBody.find(cb => cb.id === activeCardId);
      assert.ok(cardBodyOnServer, 'cardBody matches up with server cardBody');
      assert(serverData.cardBody.length === 2, 'Made a card body for each new card');
    },
  },
  {
    n: "Card Removal & subsequent creation",
    t: async (page) => {
      AP.click('#remove-card-button-active');
      let clientData = wait_for_save;
      //We allow removal after creation of a second card
      const activeCardId = clientData.activeCardId;
      assert(activeCardId, 'Selected a card');
      assert(clientData.deck.cards.length === 1, 'Now there are less cards in the deck');
      assert(clientData.deck.cards[0] === activeCardId, 'Selected previous card');
      let serverData = server_data;
      assert(serverData.deck[0].cards === clientData.deck.cards, 'Deck cards match up with server cards');
      assert(serverData.cardBody.length === 1, 'Removed a cardbody correctly');

      AP.click('#add-card');
      clientData = wait_for_save;
      serverData = server_data;
      assert(clientData.deck.cards.length === 2, 'Now there are more cards in the deck');
      assert(clientData.deck.cards[1] === String.fromCharCode(1), 'reclaimed open ID');
      assert(clientData.deck.cards[1] === String.fromCharCode(1), 'reclaimed open ID');
      assert.equal(serverData.deck[0].cards, clientData.deck.cards, 'Deck cards match up with server cards');
    },
  },
  {
    n: "Edit cards + image",
    t: async (page) => {
      AP.focus('.pell-content');
      AP.keyboard.type('Hello!');
      APC('#flip-card');
      AP.focus('.pell-content');
      AP.keyboard.type('Sailor!');
      const input = AP.$('#image-upload');
      await input.uploadFile('./test-image.png');
      let clientData = wait_for_save;
      let serverData =  server_data;
      let activeId = clientData.activeCardId;
      let cardBody = serverData.cardBody.find(cb => cb.id === activeId);
      assert(cardBody.backHasImage);
      assert(!!cardBody.backImage);
      assert(cardBody.back.indexOf('Sailor!') !== -1);
      assert(cardBody.front.indexOf('Hello!') !== -1);
      assert(!cardBody.frontHasImage);
      assert(!cardBody.frontImage);
      AP.click('#image-spot');
      AP.waitForSelector('#popup-image');
      AP.click('.popup');
      AP.waitFor(() => !document.querySelector("#overlay"));
      AP.click('#flip-card');
      AP.waitForSelector('.image-spot-without-image');
      AP.click('#flip-card');
      AP.waitForSelector('#remove-image-from-card');
      AP.click('#remove-image-from-card');
      await waitForChangesToSaveFast(page);
      serverData = server_data;
      cardBody = serverData.cardBody.find(cb => cb.id === activeId)
      // //Removed image
      assert(!cardBody.backHasImage);
      assert(!cardBody.backImage);
    },
  },
  {
    n: "Study cards",
    t: async (page) => {
      AP.click('#no-study-session-creation-button');
      APC('#flip-card-study');
      APC('#right-button');
      await waitForChangesToSaveFast(page);
      AP.click('#flip-card-study');
      APC('#wrong-button');
      //restudy the wrong answers
      APC('#restudy-button');
      await waitForChangesToSaveFast(page);
      APC('#flip-card-study');
      APC('#right-button');
      //finish study session
      APC('#finish-studying');
    },
  },
    //
  {
    n: "Deck sharing",
    t: async (page) => {
      //Share deck
      APC('.deck-edit-button');
      await clickAndWaitOnDialog(page, '#share-deck-button');
      //Now sharable
      await waitForChangesToSaveFast(page);
      AP.waitForSelector('#copy-sharable-link');
    },
  },
  {
    n: "Logout",
    t: async (page) => {
      APC('#logout-link');
    }
  },
  {
    n: "Public deck viewable by another",
    t: async (page) => {
      //Create another user
      APC('#login-button');
      APC('#signup-button');
      AP.waitForSelector('#display-name');
      AP.type('#email', email + '1');
      AP.type('#password', password);
      AP.type('#password-repeat', password);
      AP.type('#display-name', 'foo2');
      AP.click('#signup-button');
      AP.waitForNavigation();
      //Try to view shareable link
      const deckId = lastSeenClientData.deck.id;
      AP.goto(`http://localhost:3000/site/me/study?deck=${deckId}&upsert=true`);
      // On page
      AP.waitForSelector('#end-session-link');
      const data = await getClientData(page);
      assert(data.deck.id === deckId);
      assert(data.deck.cards.length === 2);
      await clickAndWaitOnDialog(page, '#end-session-link');
      //Fix bug with study history preview!

    },
  },
];

testUnderLoad = [
{
  n: "Signup Flow",
  t: async (page) => {
    //Begin on login page
    AP.goto('http://localhost:3000/site/login');
    //Page render
    AP.waitForSelector('#email');
    //Navigate to signup page
    AP.click('#signup-button');

    AP.waitForSelector('#display-name');
    AP.type('#email', email);
    AP.type('#password', password);
    AP.type('#password-repeat', password);
    AP.type('#display-name', 'foo');
    //Complete signup
    AP.click('#signup-button');
    AP.waitForNavigation();
    assert(page.url() === 'http://localhost:3000/site/me', 'failed to navigate to home');
  }
},
{
  n: "Authenticate Email",
  t: async (page) => {
    AP.waitForSelector('#email-verification-bar');
    const data = server_data;
    const emailBody = data.emails[0].text;
    const url = emailBody.substring(emailBody.indexOf('http:'));
    AP.goto(url);
    AP.waitForSelector('#email-verified');
    assert(true, 'Verified email as expected');
  },
},
{
  n: "Deck Creation",
  t: async (page) => {
    AP.click('#add-deck-card');
    //We do not allow card removal for the only card
    AP.waitForSelector('#remove-card-button-inactive');
    const clientData = wait_for_save;
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
    AP.click('#add-card');
    APC('#remove-card-button-active');
    AP.click('#add-card');
    // Making it messy
    const clientData = wait_for_save;
    //We allow removal after creation of a second card
    const activeCardId = clientData.activeCardId;
    assert(activeCardId, 'Selected a card');
    assert(clientData.deck.cards.length === 2, 'Now there are more cards in the deck');
    assert(clientData.deck.cards[1] === activeCardId, 'Updates active card to new card');
    assert(clientData.deck.cards[0] !== activeCardId, 'has a distinct id');
    assert(clientData.cardBody[activeCardId], 'Created a card body');
    const serverData = server_data;
    assert.equal(serverData.deck[0].cards, clientData.deck.cards, 'Deck cards match up with server cards');
    const cardBodyOnServer = serverData.cardBody.find(cb => cb.id === activeCardId);
    assert.ok(cardBodyOnServer, 'cardBody matches up with server cardBody');
    assert(serverData.cardBody.length === 2, 'Made a card body for each new card');
  },
},
{
  n: "Card Removal & subsequent creation",
  t: async (page) => {
    AP.click('#remove-card-button-active');
    let clientData = wait_for_save;
    //We allow removal after creation of a second card
    const activeCardId = clientData.activeCardId;
    assert(activeCardId, 'Selected a card');
    assert(clientData.deck.cards.length === 1, 'Now there are less cards in the deck');
    assert(clientData.deck.cards[0] === activeCardId, 'Selected previous card');
    let serverData = server_data;
    assert(serverData.deck[0].cards === clientData.deck.cards, 'Deck cards match up with server cards');
    assert(serverData.cardBody.length === 1, 'Removed a cardbody correctly');

    AP.click('#add-card');
    clientData = wait_for_save;
    serverData = server_data;
    assert(clientData.deck.cards.length === 2, 'Now there are more cards in the deck');
    assert(clientData.deck.cards[1] === String.fromCharCode(1), 'reclaimed open ID');
    assert(clientData.deck.cards[1] === String.fromCharCode(1), 'reclaimed open ID');
    assert.equal(serverData.deck[0].cards, clientData.deck.cards, 'Deck cards match up with server cards');
  },
},
{
  n: "Edit cards + image 2000",
  t: async (page) => {
    for(let i = 0; i < 2000; i++) {
      AP.focus('.pell-content');
      AP.keyboard.type('Hello!' + i);
      let input = AP.$('#image-upload');
      await input.uploadFile('./test-image.png');
      await waitForChangesToSaveFast(page);
      APC('#flip-card');
      AP.focus('.pell-content');
      AP.keyboard.type('Sailor!' + i);
      input = AP.$('#image-upload');
      await input.uploadFile('./test-image.png');
      AP.click('#add-card');
      await waitForChangesToSaveFast(page);
    }
  },
},
];
