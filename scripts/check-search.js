// Read-only diagnostic. Does not print credentials, request URLs containing API keys, or model replies.
require('dotenv').config();
const { searchWebDetailed } = require('../lib/search-service');

async function main() {
  const query = process.argv.slice(2).join(' ').trim() || 'hội nghị thượng đỉnh APEC 2026 diễn ra ở đâu';
  const report = await searchWebDetailed(query);
  console.log(JSON.stringify({
    status: report.status, provider: report.provider, query: report.query,
    attempts: report.attempts, durationMs: report.durationMs,
    results: report.results.map(result => ({ title: result.title, url: result.url, publishedAt: result.publishedAt }))
  }, null, 2));
  if (report.status !== 'ok') process.exitCode = 1;
}
main().catch(() => { console.error('Không chạy được chẩn đoán tìm kiếm.'); process.exitCode = 1; });
