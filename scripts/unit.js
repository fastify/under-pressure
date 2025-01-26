'use strict'

const { globSync } = require('fast-glob')
const { exec } = require('node:child_process')

// Need to use glob sync because
// Windows is not able to expand patterns by itself
const testFiles = [
  ...globSync('test/**/*.test.js'),
]

const args = ['node', '--test', ...testFiles]

const child = exec(args.join(' '), {
  shell: true,
})

child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)
child.once('close', process.exit)
