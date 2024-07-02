import fs from 'fs'
import StationIdInterface from './hardware/id-driver/station-id-interface.js'


// Relavant system files
const Files = {
    Image: '/etc/ctt/station-image',
    Software: '/etc/ctt/station-software'
}

// parse station version / revision
const id_interface = new StationIdInterface()
const {
    version: Version,
    revision: Revision,
    id: Id,
} = await id_interface.getHardwareInfo()

// parse station image date
const Image = new Date(fs.readFileSync(Files.Image).toString())
const Software = new Date(fs.readFileSync(Files.Software).toString())

export default Object.freeze({
    Image,
    Hardware: {
        Version,
        Revision,
        Id,
    },
    Software
})