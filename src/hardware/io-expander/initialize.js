import HardwarePins from './pins.js'

import { 
  Reset,
  EnablePullUp,
  SetDirection,
} from './expander.js'

// aggregate Button and Config pins
const AllPins = HardwarePins.Buttons.concat(HardwarePins.Configs)

export default async function() {
  console.log('initializing IO expander')
  await Reset()
  // set pins to pull up
  await EnablePullUp(AllPins)
  // set pins as input
  await SetDirection(AllPins)
}