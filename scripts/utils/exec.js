const { execSync } = require('child_process')

function execCommand (cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8' })
  } catch (err) {
    return err.stdout || ''
  }
}

module.exports = { execCommand }
