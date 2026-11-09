const {Builder, Browser} = require('selenium-webdriver');

(async function helloSelenium() {
  const driver = await new Builder().forBrowser(Browser.EDGE).build();
  try {
    await driver.get('https://selenium.dev');
  } finally {
    await driver.quit();
  }
})();
