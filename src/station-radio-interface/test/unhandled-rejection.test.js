/**
 * The unhandled-rejection reporter.
 *
 * Node's default (--unhandled-rejections=throw) already exits the process; what
 * these tests pin is that the exit is still non-zero (so systemd's
 * Restart=on-failure keeps working) AND that it now carries a greppable line
 * naming the script and the reason.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(HERE, 'support', 'reject-fixture.mjs')
const SRC = path.resolve(HERE, '../..') // <repo>/src

const runFixture = (mode) => new Promise((resolve) => {
  const child = spawn(process.execPath, [FIXTURE, mode ?? ''], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (c) => { stdout += c })
  child.stderr.on('data', (c) => { stderr += c })
  child.on('close', (code) => resolve({ code, stdout, stderr }))
})

test('an unhandled rejection exits non-zero and logs a tagged line', async () => {
  const { code, stdout, stderr } = await runFixture()

  assert.equal(code, 1, 'non-zero so systemd Restart=on-failure still fires')
  assert.match(stderr, /CTT-UNHANDLED-REJECTION/, 'greppable tag present')
  assert.match(stderr, /reject-fixture\.mjs/, 'names the script that died')
  assert.match(stderr, /deliberate test rejection/, 'carries the reason')
  assert.match(stderr, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z /m, 'timestamped')
  assert.doesNotMatch(stdout, /TIMER FIRED/, 'exited promptly, did not swallow')
})

test('a rejection from an async function is reported the same way', async () => {
  const { code, stderr, stdout } = await runFixture('async-fn')

  assert.equal(code, 1)
  assert.match(stderr, /CTT-UNHANDLED-REJECTION/)
  assert.match(stderr, /rejection from an async function/)
  assert.doesNotMatch(stdout, /TIMER FIRED/)
})

test('a non-Error rejection is stringified rather than crashing the reporter', async () => {
  const { code, stderr, stdout } = await runFixture('string')

  assert.equal(code, 1)
  assert.match(stderr, /CTT-UNHANDLED-REJECTION/)
  assert.match(stderr, /a bare string rejection/)
  assert.doesNotMatch(stdout, /TIMER FIRED/)
})

test('every service entry point installs the reporter', () => {
  // a new service that forgets this import silently reverts to bare stack traces
  const entrypoints = [
    'station-radio-interface/index.js',
    'station-lcd-interface/index.js',
    'station-hardware-server/bin/www.js',
    'station-interface/bin/www.js',
  ]
  for (const entry of entrypoints) {
    const source = fs.readFileSync(path.join(SRC, entry), 'utf8')
    assert.match(
      source,
      /import '(\.\.\/)+station-utils\/log-unhandled-rejections\.js'/,
      `${entry} does not import log-unhandled-rejections.js`
    )
    assert.match(
      source,
      /import '(\.\.\/)+station-utils\/prefer-ipv4\.js'/,
      `${entry} lost its prefer-ipv4 import`
    )
  }
})
