// Build a single self-contained dashboard HTML by inlining unified.json + dashboard.js
// Outputs both index.html (for Vercel/static hosting) and a friendly download name.
const fs = require('fs');

const template = fs.readFileSync('dashboard_template.html', 'utf-8');
const data = fs.readFileSync('unified.json', 'utf-8');
const js = fs.readFileSync('dashboard.js', 'utf-8');

// Use function replacements so $-patterns in data/js are NOT interpreted as $&, $1, etc.
const out = template
  .replace('/*__DATA_INJECTION__*/ null /*__END_DATA__*/', () => data)
  .replace('<script src="dashboard.js"></script>', () => '<script>\n' + js + '\n</script>');

const outputs = ['index.html', 'Little Spoon Retail Dashboard.html'];
for (const p of outputs) {
  fs.writeFileSync(p, out);
  console.log(`Built ${p}: ${(fs.statSync(p).size / 1024).toFixed(0)} KB`);
}
