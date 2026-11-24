import { chromium } from 'playwright-core';

const browser = await chromium.launch({
	executablePath: process.env.PDF_CHROMIUM_PATH || undefined,
	timeout: 15000
});
try {
	const page = await browser.newPage();
	await page.setContent('<p>Sapin</p>');
	await page.pdf({ format: 'A4' });
	console.log('PDF OK');
} finally {
	await browser.close();
}
