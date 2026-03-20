import fs from 'fs/promises';

class Report {
    constructor(data) {
        this.data = data;
    }

    summary() {
        const { users, generatedAt } = this.data;
        return `Report generated at ${generatedAt} for ${users.length} users.`;
    }
}

async function loadConfig() {
    const raw = await fs.readFile('config.json', 'utf-8');
    return JSON.parse(raw);
}

(async () => {
    const config = await loadConfig();
    const report = new Report(config);
    console.log(report.summary());
})();

