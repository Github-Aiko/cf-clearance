async function findAcceptLanguage(page) {
    await page.setBypassCSP(true)
    return await page.evaluate(async () => {
        const result = await fetch('https://httpbin.org/get')
            .then(res => res.json())
            .then(res => (res.headers['Accept-Language'] || res.headers['accept-language']))
            .catch(() => null)
        return result
    })
}

function getBrowser({ url, proxy }) {
    return new Promise(async (resolve, reject) => {
        if (!url) return reject('Missing url parameter');
        const context = await global.browser.createBrowserContext().catch(() => null);
        if (!context) return reject('Failed to create browser context');

        let isResolved = false;

        const { proxyRequest } = await import('puppeteer-proxy');

        const timeout = setTimeout(async () => {
            if (!isResolved) {
                await context.close();
                reject("Timeout Error");
            }
        }, (global.timeOut || 60000));

        try {
            const page = await context.newPage();
            await page.setRequestInterception(true);
            page.on('request', async (request) => {
                try {
                    if (proxy) {
                        await proxyRequest({
                            page,
                            proxyUrl: `http://${proxy.username ? `${proxy.username}:${proxy.password}@` : ""}${proxy.host}:${proxy.port}`,
                            request,
                        });
                    } else {
                        request.continue();
                    }
                } catch (e) { }
            });

            page.on('response', async (res) => {
                try {
                    if ([200, 302].includes(res.status()) && [url, url + '/'].includes(res.url())) {
                        await page.waitForNavigation({ waitUntil: 'load', timeout: 5000 }).catch(() => { });
                        const cookies = await page.cookies();
                        const headers = await res.request().headers();
                        delete headers['content-type'];
                        delete headers['accept-encoding'];
                        delete headers['accept'];
                        delete headers['content-length'];
                        headers["accept-language"] = await findAcceptLanguage(page);

                        const title = await page.title(); // Lấy tiêu đề trang
                        const userAgent = await page.evaluate(() => navigator.userAgent); // Lấy User-Agent

                        await context.close();
                        isResolved = true;
                        clearTimeout(timeout);

                        resolve({
                            title,
                            cookies,
                            userAgent,
                            headers,
                            proxy: proxy || null // Trả về proxy nếu có
                        });
                    }
                } catch (e) { }
            });

            await page.goto(url, {
                waitUntil: 'domcontentloaded'
            });
        } catch (e) {
            if (!isResolved) {
                await context.close();
                clearTimeout(timeout);
                reject(e.message);
            }
        }
    });
}

module.exports = getBrowser;