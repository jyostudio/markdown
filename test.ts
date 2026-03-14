import { markdownToHtml, parse, renderHtml } from './src/index.ts';
import { readFileSync } from 'fs';

// ── Run CommonMark spec tests ────────────────────────────────────

interface SpecTest {
  markdown: string;
  html: string;
  example: number;
  section: string;
  start_line: number;
  end_line: number;
}

const specTests: SpecTest[] = JSON.parse(readFileSync('spec-tests.json', 'utf-8'));

let passed = 0;
let failed = 0;
const failures: { example: number; section: string; input: string; expected: string; got: string }[] = [];

for (const test of specTests) {
  const result = markdownToHtml(test.markdown);
  if (result === test.html) {
    passed++;
  } else {
    failed++;
    if (failures.length < 30) {
      failures.push({
        example: test.example,
        section: test.section,
        input: test.markdown,
        expected: test.html,
        got: result,
      });
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${specTests.length} spec tests\n`);

// Group failures by section
const sectionFailures: Record<string, number> = {};
for (const test of specTests) {
  const result = markdownToHtml(test.markdown);
  if (result !== test.html) {
    sectionFailures[test.section] = (sectionFailures[test.section] || 0) + 1;
  }
}

console.log('Failures by section:');
for (const [section, count] of Object.entries(sectionFailures).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${section}: ${count}`);
}

console.log('\nAll failing examples:');
for (const f of failures.slice(0, 30)) {
  console.log(`  Example ${f.example} (${f.section}):`);
  console.log(`    Input:    ${JSON.stringify(f.input).slice(0, 80)}`);
  console.log(`    Expected: ${JSON.stringify(f.expected).slice(0, 80)}`);
  console.log(`    Got:      ${JSON.stringify(f.got).slice(0, 80)}`);
}
