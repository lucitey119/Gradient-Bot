const { Builder, By, until, Capabilities } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const url = require("url");
const fs = require("fs");
const crypto = require("crypto");
const request = require("request");
const path = require("path");
const FormData = require("form-data");
const proxy = require("selenium-webdriver/proxy");
const proxyChain = require("proxy-chain");
require("dotenv").config();
const colors = require("colors");

class Gradient {
  constructor() {
    // Cấu trúc tài khoản
    this.accounts = [
      // Format: {user: "email", password: "pass", proxy: "http://user:pass@ip:port"}
      // Ví dụ:
      // {user: "user1@example.com", password: "pass1", proxy: ""},
      // {user: "user2@example.com", password: "pass2", proxy: ""}
    ];
    this.extensionId = "caacbgbklghmpodbdafajbgdnegacfmo";
    this.CRX_URL = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=98.0.4758.102&acceptformat=crx2,crx3&x=id%3D${this.extensionId}%26uc&nacl_arch=x86-64`;
    this.USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36";
    this.ALLOW_DEBUG = process.env.ALLOW_DEBUG === "True";
    this.EXTENSION_FILENAME = "app.crx";
  }

  loadData() {
    try {
      const accountsFile = fs.readFileSync("accounts.json", "utf8");
      const accountsData = JSON.parse(accountsFile);
      this.accounts.push(...accountsData);
    } catch (err) {
      logMess("-> Không tìm thấy tệp account.json, sử dụng env", "warning");
      if (process.env.APP_USER && process.env.APP_PASS) {
        accounts.push({
          user: process.env.APP_USER,
          password: process.env.APP_PASS,
          proxy: process.env.PROXY,
        });
      }
    }
  }

  downloadExtension(extensionId) {
    const url = this.CRX_URL.replace(extensionId, extensionId);
    const headers = { "User-Agent": this.USER_AGENT };

    logMess(`-> Downloading extension from: ${url}`);

    // if file exists, return
    if (fs.existsSync(this.EXTENSION_FILENAME)) {
      logMess("-> Extension already downloaded! skip download...");
      return;
    }

    return new Promise((resolve, reject) => {
      request({ url, headers, encoding: null }, (error, response, body) => {
        if (error) {
          console.error("Error downloading extension:", error);
          return reject(error);
        }
        fs.writeFileSync(this.EXTENSION_FILENAME, body);
        if (this.ALLOW_DEBUG) {
          const md5 = crypto.createHash("md5").update(body).digest("hex");
          logMess(`"-> Extension MD5: ${md5}`);
        }
        resolve();
      });
    });
  }

  async takeScreenshot(driver, filename) {
    const data = await driver.takeScreenshot();
    fs.writeFileSync(filename, Buffer.from(data, "base64"));
  }

  async generateErrorReport(driver) {
    try {
      await this.takeScreenshot(driver, "error.png");

      const logs = await driver.manage().logs().get("browser");
      fs.writeFileSync(
        "error.log",
        logs
          .map((log) => {
            if (log.message.includes("the server responded with a status of 400")) logMess(`Vui lòng kiểm tra lại thông tin tài khoản đăng nhập hoặc xem lại hình error.png`, "warning");
            else logMess(`${log.message}`, "warning");
            return `${log.level.name}: ${log.message}`;
          })
          .join("\n")
      );
    } catch (error) {
      logMess(`${error.message}`, "error");
    }
  }

  async getDriverOptions(account) {
    const options = new chrome.Options();

    options.addArguments(`user-agent=${this.USER_AGENT}`);
    options.addArguments("--headless=new");
    options.addArguments("--ignore-certificate-errors");
    options.addArguments("--ignore-ssl-errors");
    options.addArguments("--no-sandbox");
    options.addArguments("--remote-allow-origins=*");
    options.addArguments("enable-automation");
    options.addArguments("--dns-prefetch-disable");
    options.addArguments("--disable-dev-shm-usage");
    options.addArguments("--disable-ipv6");
    options.addArguments("--aggressive-cache-discard");
    options.addArguments("--disable-cache");
    options.addArguments("--disable-application-cache");
    options.addArguments("--disable-offline-load-stale-cache");
    options.addArguments("--disk-cache-size=0");

    if (account.proxy) {
      logMess(`-> Thiết lập proxy cho ${account.user}:`, account.proxy);
      let newProxyUrl;
      let proxyUrl = account.proxy;
      if (!proxyUrl.includes("://")) {
        proxyUrl = `http://${proxyUrl}`;
      }
      try {
        newProxyUrl = await proxyChain.anonymizeProxy(proxyUrl);
      } catch (error) {
        console.error("Không thể anonymize proxy: ", error);
        return; // Hoặc xử lý lỗi theo cách bạn muốn
      }

      logMess("-> URL proxy mới: " + newProxyUrl);

      options.setProxy(
        proxy.manual({
          http: newProxyUrl,
          https: newProxyUrl,
        })
      );
      const url = new URL(newProxyUrl);
      options.addArguments(`--proxy-server=socks5://${url.hostname}:${url.port}`);
    }

    return options;
  }

  async runAccount(account) {
    logMess(`-> Bắt đầu tài khoản ${account.user}...`);

    const options = await this.getDriverOptions(account);
    options.addExtensions(path.resolve(__dirname, this.EXTENSION_FILENAME));

    if (this.ALLOW_DEBUG) {
      options.addArguments("--enable-logging");
      options.addArguments("--v=1");
    }

    let driver;
    try {
      driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();

      logMess(`-> Trình duyệt đã bắt đầu cho ${account.user}`);

      logMess(`-> Đăng nhập ${account.user}...`);
      await driver.get("https://app.gradient.network/");

      const emailInput = By.css('[placeholder="Enter Email"]');
      const passwordInput = By.css('[type="password"]');
      const loginButton = By.css("button");

      await driver.wait(until.elementLocated(emailInput), 30000);
      await driver.wait(until.elementLocated(passwordInput), 30000);
      await driver.wait(until.elementLocated(loginButton), 30000);

      await driver.findElement(emailInput).sendKeys(account.user);
      await driver.findElement(passwordInput).sendKeys(account.password);
      await driver.findElement(loginButton).click();

      await driver.wait(until.elementLocated(By.xpath('//*[contains(text(), "Copy Referral Link")]')), 30000);

      logMess(`-> ${account.user} đã đăng nhập! Mở extension...`, "success");

      await driver.get(`chrome-extension://${this.extensionId}/popup.html`);

      await driver.wait(until.elementLocated(By.xpath('//div[contains(text(), "Status")]')), 30000);

      try {
        await driver.findElement(By.xpath('//*[contains(text(), "Sorry, Gradient is not yet available in your region.")]'));
        logMess(`-> ${account.user}: Gradient not available in region`, "warning");
        await driver.quit();
        return;
      } catch (error) {
        // Region is available, continue
      }

      // Get status
      await driver.wait(until.elementLocated(By.xpath('//*[contains(text(), "Today\'s Taps")]')), 30000);

      const supportStatus = await driver.findElement(By.css(".absolute.mt-3.right-0.z-10")).getText();

      logMess(`-> ${account.user} Status:`, supportStatus);

      if (supportStatus.includes("Disconnected")) {
        logMess(`-> ${account.user}: Failed to connect!`, "error");
        await driver.quit();
        return;
      }

      setInterval(() => {
        driver.getTitle().then((title) => {
          logMess(`-> [${account.user}] node đang chạy...`, title);
          if (account.proxy) {
            logMess(`-> [${account.user}][${account.proxy}] node đang chạy...`);
          }
        });
      }, 10000);
    } catch (error) {
      console.error(`Error with account ${account.user}:`, error);
      if (driver) {
        await this.generateErrorReport(driver);
        await driver.quit();
      }
    }
  }

  async main() {
    console.log("SUBSCRIBE OUR CHANNEL FORESTARMY (https://t.me/forestarmy)".yellow);
    this.loadData();
    await this.downloadExtension(this.extensionId);

    const promises = this.accounts.map((account) => this.runAccount(account));
    await Promise.all(promises);
  }
}

function logMess(msg, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  switch (type) {
    case "success":
      console.log(`[${timestamp}] [*] ${msg}`.green);
      break;
    case "custom":
      console.log(`[${timestamp}] [*] ${msg}`.magenta);
      break;
    case "error":
      console.log(`[${timestamp}] [!] ${msg}`.red);
      break;
    case "warning":
      console.log(`[${timestamp}] [*] ${msg}`.yellow);
      break;
    default:
      console.log(`[${timestamp}] [*] ${msg}`.blue);
  }
}

const client = new Gradient();
client.main().catch((err) => {
  logMess(err.message, "error");
  process.exit(1);
});
