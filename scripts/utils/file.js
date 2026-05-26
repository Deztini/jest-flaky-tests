const fs = require('fs')

function writeJSON (file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

module.exports = { writeJSON }
