const { detectFramework } = require('./core/detectFramework')
const { parseTestResults, getTotalTestCount } = require('./core/parseTestResults')
const { rerunTests } = require('./core/rerunTests')
const { runTests } = require('./core/runTests')
const { writeJSON } = require('./utils/file')
const fs = require('fs')

async function main () {
  const fileMap = {
    jest: 'jest-results.json',
    mocha: 'mocha-results.json',
    vitest: 'vitest-results.json',
    playwright: 'playwright-results.json',
    cypress: 'mochawesome-report/mochawesome.json',
    default: 'default-results.json',
  }

  console.log('FlakeyRadar started...')

  const framework = detectFramework()
  console.log('Detected Framework: ', framework)

  await runTests(framework)

  const filePath = fileMap[framework]
  let raw = fs.readFileSync(filePath, 'utf-8')
  const jsonStart = raw.indexOf('{')
  const jsonEnd = raw.lastIndexOf('}')
  if (jsonStart > -1 && jsonEnd > -1) {
    raw = raw.slice(jsonStart, jsonEnd + 1)
  }
  const data = JSON.parse(raw)
  console.log('Top-level keys:', Object.keys(data))
  console.log('suites length:', data.suites?.length)
  console.log('stats:', JSON.stringify(data.stats))
  if (data.suites?.[0]) {
    console.log('First suite keys:', Object.keys(data.suites[0]))
    console.log('First suite:', JSON.stringify(data.suites[0]).slice(0, 800))
  }
  console.log('Expecting results at:', filePath)
  console.log('File exists?', fs.existsSync(filePath))
  const failedTest = parseTestResults(filePath, framework)
  console.log('Failed tests found:', failedTest.length)

  const totalTests = getTotalTestCount(filePath, framework)
  console.log('Total tests:', totalTests)

  const flakyResults = await rerunTests(failedTest, framework)

  writeJSON('flaky-results.json', { totalTests, results: flakyResults })

  console.log('Flaky results saved')
}

main()
