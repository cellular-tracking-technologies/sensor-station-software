import { QaqcPacket } from './packet.js'

class ModemPacket {
	constructor(opts) {
		this.station_id = opts.station_id
		this.signal = opts.signal
		this.carrier = opts.carrier
		this.network = opts.network

		this.packet = new QaqcPacket({
			category: 1,
			type: 5,
			station_id: this.station_id,
			payload: this.getPayload()
		})
	}

	getPayload() {
		let signal = 0
		try {
			signal = parseInt(Math.abs(this.signal))
		} catch (err) {
			console.error('error parsing signal strength', this.signal)
		}
		let buffer = Buffer.alloc(1)
		buffer.writeUInt8(signal)
		let carrier = this.carrier
		if (carrier.length > 8) {
			carrier = carrier.slice(0, 8)
		} else {
			carrier = carrier.padStart(8, ' ')
		}
		let network = this.network
		if (network.length > 4) {
			network = network.slice(0, 4)
		} else {
			network = network.padStart(4, ' ')
		}
		return Buffer.concat([
			buffer,
			Buffer.from(carrier),
			Buffer.from(network)
		])
	}
}

export { ModemPacket }