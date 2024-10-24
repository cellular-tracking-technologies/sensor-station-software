import Ads7924 from "./ads7924.js"

class Adc{
  constructor(opts){
    this.adc
    if(opts.type === "Ads7924"){
      this.adc = new Ads7924()
    }
  }

  init(){
    this.adc.init()
  }

  read(channel){
    const channels = this.adc.read()
    return channels[channel]
  }
}

export default Adc
