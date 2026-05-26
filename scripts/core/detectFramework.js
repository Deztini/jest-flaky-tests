const fs = require('fs')

const jestFiles = [
  'jest.config.js',
  'jest.config.ts',
  'jest.config.mjs',
  'jest.config.cjs',
  'jest.config.cts',
  'jest.config.json',
]

function detectFramework () {
  const pkj = fs.existsSync('package.json')
    ? fs.readFileSync('package.json', 'utf-8')
    : ''

  const hasJestConfig = jestFiles.some((file) => fs.existsSync(file))

  if (hasJestConfig || fs.existsSync('__tests__')) return 'jest'
  if (pkj.includes('vitest')) return 'vitest'
  if (pkj.includes('mocha')) return 'mocha'
  if (pkj.includes('cypress')) return 'cypress'
  if (pkj.includes('playwright')) return 'playwright'

  return 'default'
}

module.exports = { detectFramework }
