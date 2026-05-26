const fs = require('fs')
const { execCommand } = require('../utils/exec')

function getTestScript () {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
    return pkg.scripts?.test
  } catch {
    return null
  }
}

function runTests (framework) {
  console.log(`Running ${framework} tests...`)

  switch (framework) {
    case 'jest': {
      return execCommand('npx jest --json --outputFile=jest-results.json')
    }
    case 'mocha': {
      return execCommand('npx mocha --reporter json > mocha-results.json')
    }
    case 'vitest': {
      return execCommand(
        'npx vitest run --reporter=json --outputFile=vitest-results.json'
      )
    }
    case 'cypress': {
      return execCommand(
        `npx cypress run
--reporter mochawesome
--reporter-options reportDir=mochawesome-report,reportFilename=report`
      )
    }
    case 'playwright': {
      return execCommand(
        'npx playwright test --reporter=json > playwright-results.json'
      )
    }
    default: {
      const script = getTestScript()

      if (!script) {
        console.log('No test script found')
        return ''
      }

      return execCommand('npm test -- --reporter=json > default-results.json')
    }
  }
}

module.exports = { runTests }
