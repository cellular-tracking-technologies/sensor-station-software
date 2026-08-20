/**
 * Child-process fixture for the unhandledRejection tests.
 *
 * argv[2] selects what to reject with. The 2s timer must never fire: if it
 * does, the rejection was swallowed instead of being reported and exited on.
 */
import '../../../station-utils/log-unhandled-rejections.js'

const mode = process.argv[2]

if (mode === 'string') {
  Promise.reject('a bare string rejection')
} else if (mode === 'async-fn') {
  const boom = async () => { throw new Error('rejection from an async function') }
  boom()
} else {
  Promise.reject(new Error('deliberate test rejection'))
}

setTimeout(() => {
  console.log('TIMER FIRED - rejection was never reported')
  process.exit(0)
}, 2000)
