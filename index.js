import fs from 'fs-extra';
import path from 'path';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION ---
const CSV_FILE = 'urls.csv';
const strategies = ['mobile', 'desktop'];

async function runAudit() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dateFolder = new Date().toISOString().split('T')[0];
    const outputDir = path.join(__dirname, 'reports', dateFolder);

    await fs.ensureDir(outputDir);

    // Read and parse CSV
    let urls = [];
    try {
        const fileContent = await fs.readFile(path.join(__dirname, CSV_FILE));
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });
        urls = records.map(record => record.url).filter(url => url);
    } catch (err) {
        console.error(`❌ Error reading or parsing ${CSV_FILE}:`, err.message);
        return;
    }

    if (urls.length === 0) {
        console.log(`⚠️ No URLs found in ${CSV_FILE}. Please check the file format.`);
        return;
    }

    console.log(`🚀 Starting Lighthouse audits for ${urls.length} URLs. Reports will be saved in: ${outputDir}`);

    // PSI-like Throttling Profiles (Simplified to match PSI UI)
    const throttling = {
        mobile: {
            rttMs: 150, // 150 ms TCP RTT
            throughputKbps: 1638.4, // 1,638.4 kb/s throughput
            cpuSlowdownMultiplier: 1.2, // 1.2x slowdown
        },
        desktop: {
            rttMs: 40, // 40 ms TCP RTT
            throughputKbps: 10240, // 10,240 kb/s throughput
            cpuSlowdownMultiplier: 1, // 1x slowdown
        }
    };

    try {
        for (const url of urls) {
            const urlObj = new URL(url);
            let urlSlug = (urlObj.hostname + urlObj.pathname + urlObj.search)
                .replace(/^www\./, '')
                .replace(/\/$/, '')
                .replace(/[^a-z0-0.]/gi, '-');

            for (const strategy of strategies) {
                console.log(`\nAuditando [${strategy.toUpperCase()}]: ${url}...`);

                // Launch fresh browser per audit for stability
                const browser = await puppeteer.launch({
                    headless: 'new',
                    args: ['--remote-debugging-port=9222'],
                });

                const endpoint = browser.wsEndpoint();
                const port = parseInt(new URL(endpoint).port);

                try {
                    // Lighthouse audit - Reduced logLevel to 'error' to hide CDP noise
                    const runnerResult = await lighthouse(url, {
                        logLevel: 'error',
                        output: ['json', 'html'],
                        port: port,
                        throttlingMethod: 'simulate',
                        formFactor: strategy,
                        screenEmulation: strategy === 'desktop' ? {
                            mobile: false,
                            width: 1350,
                            height: 940,
                            deviceScaleFactor: 1,
                            disabled: false,
                        } : {
                            mobile: true,
                            width: 412, // Moto G Power
                            height: 823, // Moto G Power
                            deviceScaleFactor: 1.75, // Moto G Power DPR
                            disabled: false,
                        },
                        emulatedFormFactor: strategy,
                        throttling: throttling[strategy],
                    });

                    if (!runnerResult || !runnerResult.report) {
                        throw new Error(`No se pudo generar el reporte para: ${url}`);
                    }

                    const reportHtml = runnerResult.report[1];
                    const reportJson = runnerResult.report[0];

                    const baseFilename = `${urlSlug}_${strategy}_${timestamp}`;
                    const jsonPath = path.join(outputDir, `${baseFilename}.json`);
                    const pdfPath = path.join(outputDir, `${baseFilename}.pdf`);

                    // Save JSON
                    await fs.outputFile(jsonPath, reportJson);
                    console.log(`✅ JSON saved: ${path.basename(jsonPath)}`);

                    // Generate PDF using the same browser instance
                    const page = await browser.newPage();
                    await page.setContent(reportHtml, { waitUntil: 'networkidle0' });

                    // Force Expand Sections
                    await page.evaluate(() => {
                        const style = document.createElement('style');
                        style.innerHTML = `
                            .lh-audit__details, .lh-details, .lh-audit-group__stats, 
                            .lh-passed-audits, .lh-audit-group__summary {
                                display: block !important;
                                visibility: visible !important;
                                opacity: 1 !important;
                                max-height: none !important;
                            }
                            .lh-audit--expandable .lh-chevron { transform: rotate(180deg) !important; }
                            .lh-audit__details table { width: 100% !important; display: table !important; }
                        `;
                        document.head.appendChild(style);

                        document.querySelectorAll('.lh-audit').forEach(el => el.classList.add('lh-audit--expanded'));
                        document.querySelectorAll('.lh-audit-group').forEach(el => el.classList.add('lh-audit-group--expanded'));
                        document.querySelectorAll('.lh-audit-group__summary').forEach(el => el.setAttribute('aria-expanded', 'true'));
                        document.querySelectorAll('details').forEach(el => el.open = true);

                        document.querySelectorAll('button, .lh-audit__expand-less, .lh-audit__expand-more').forEach(btn => {
                            const txt = btn.innerText.toLowerCase();
                            if (txt.includes('show') || txt.includes('expand') || txt.includes('ver') || txt.includes('mostrar')) {
                                btn.click();
                            }
                        });

                        const passedAudits = document.querySelector('.lh-passed-audits-summary');
                        if (passedAudits) passedAudits.click();
                    });

                    await new Promise(resolve => setTimeout(resolve, 3000));
                    await page.addStyleTag({ content: '@page { size: A3; margin: 1cm; }' });

                    await page.pdf({
                        path: pdfPath,
                        format: 'A3',
                        printBackground: true,
                        margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
                    });
                    await page.close();

                    console.log(`✅ PDF saved: ${path.basename(pdfPath)}`);
                } catch (auditError) {
                    console.error(`❌ Error auditando ${url} [${strategy}]:`, auditError.message);
                } finally {
                    // Always kill browser between audits to avoid CDP errors
                    await browser.close();
                }
            }
        }
    } catch (error) {
        console.error('❌ Error during audit process:', error);
    } finally {
        console.log('\n✨ All audits completed sequentially.');
    }
}

runAudit();
