const fs = require('fs')
const crypto = require('crypto')

function readJSON (filePath) {
  try {
    let raw = fs.readFileSync(filePath, 'utf-8')
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart > -1 && jsonEnd > -1) {
      raw = raw.slice(jsonStart, jsonEnd + 1)
    }
    return JSON.parse(raw)
  } catch {
    console.log(`Failed to read/parse ${filePath}`)
    return null
  }
}

function extractTestCode (filePath, testName) {
  try {
    const source = fs.readFileSync(filePath, 'utf-8')
    const lines = source.split('\n')
    const startIndex = lines.findIndex((line) => line.includes(testName))

    if (startIndex === -1) return source.slice(0, 500)

    let openBraces = 0
    let started = false
    let endIndex = startIndex

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i]

      for (const char of line) {
        if (char === '{') {
          openBraces++
          started = true
        }
        if (char === '}') openBraces--
      }

      if (started && openBraces === 0) {
        endIndex = i
        break
      }
    }

    return lines.slice(startIndex, endIndex + 1).join('\n')
  } catch {
    return ''
  }
}

function getTotalTestCount (filePath, framework) {
  const data = readJSON(filePath)
  if (!data) return 0

  if (framework === 'jest') {
    return data.numTotalTests || 0
  }

  if (framework === 'vitest') {
    return data.testResults?.reduce(
      (sum, suite) => sum + (suite.assertionResults?.length || 0), 0
    ) || 0
  }

  if (framework === 'mocha') {
    return data.stats?.tests || 0
  }

  if (framework === 'playwright') {
    const stats = data.stats || {}
    return (stats.expected || 0) + (stats.unexpected || 0) + (stats.skipped || 0)
  }

  return 0
}

function parseTestResults (filePath, framework) {
  const data = readJSON(filePath)
  if (!data) return []

  if (framework === 'jest') {
    return (
      data.testResults?.flatMap((suite) =>
        suite.assertionResults
          ?.filter((t) => t.status === 'failed')
          .map((t) => ({
            id: crypto.randomUUID(),
            name: t.fullName,
            message: t.failureMessages?.join('\n') || '',
            file: suite.name,
            testCode: extractTestCode(suite.name, t.fullName),
          }))
      ) || []
    )
  }

  if (framework === 'vitest') {
    return (
      data.testResults?.flatMap((suite) =>
        suite.assertionResults
          ?.filter((t) => t.status === 'failed')
          .map((t) => ({
            id: crypto.randomUUID(),
            name: t.fullName,
            message: t.errors?.map((e) => e.message).join('\n') || '',
            file: suite.name,
            testCode: extractTestCode(suite.name, t.fullName),
          }))
      ) || []
    )
  }

  if (framework === 'mocha') {
    return (data.failures || []).map((t) => ({
      id: crypto.randomUUID(),
      name: t.fullTitle,
      message: t.err?.message || '',
      file: t.file,
      testCode: extractTestCode(t.file, t.fullTitle),
    }))
  }

  if (framework === 'cypress') {
    return (data.failures || []).map((t) => ({
      id: crypto.randomUUID(),
      name: t.fullTitle,
      message: t.err?.message || '',
      file: t.file,
      testCode: extractTestCode(t.file, t.fullTitle),
    }))
  }

  if (framework === 'playwright') {
    const results = []

    function traverseSuites (suites) {
      if (!suites) return
      for (const suite of suites) {
        if (suite.suites) traverseSuites(suite.suites)

        suite.specs?.forEach((spec) => {
          spec.tests?.forEach((test) => {
            test.results?.forEach((result) => {
              if (result.status === 'failed' || result.status === 'unexpected') {
                results.push({
                  id: crypto.randomUUID(),
                  name: spec.title,
                  message: result.error?.message || '',
                  file: spec.file,
                  testCode: extractTestCode(spec.file, spec.title),
                })
              }
            })
          })
        })
      }
    }

    traverseSuites(data.suites)
    return results
  }

  return []
}

module.exports = { parseTestResults, getTotalTestCount }
