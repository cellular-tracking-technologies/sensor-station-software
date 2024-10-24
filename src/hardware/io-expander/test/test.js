import { Reset, EnablePullUp, SetDirection, PollState, Drive, Toggle, SetState } from '../expander.js'

const LEDS = [0, 10, 11]

const BUTTONS = [12, 13, 14, 15]

const CFGS = [1,2,3,4,5,6,7]

const prepare_station = async () => {
  let pins = CFGS.concat(BUTTONS)

  console.log('reset')
  await Reset()
  console.log('pull ups')
  await EnablePullUp(pins)
  console.log('direction')
  await SetDirection(pins)
}

const blink = async () => {
  Drive({
    pins: LEDS,
    state: 'low'
  })
  Drive({
    pins: [11],
    state: 'high'
  })
  setInterval(() => {
    console.log()
    Toggle([10,0])
  }, 1000)
}

const run = async () => {
   await prepare_station()
  // await blink()
  await SetState([{
    pin: 0,
    state: 'toggle',
  },{
    pin: 10,
    state: 'toggle',
  },{
    pin: 11,
    state: 'toggle'
  }])
}

run()


