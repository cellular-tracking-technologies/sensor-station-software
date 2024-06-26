import fs from 'fs'


// Relavant system files
const Files = {
    Image: '/etc/ctt/station-image',
    Revision: '/etc/ctt/station-revision'
}

// parse station revision
const Revision = parseFloat(fs.readFileSync(Files.Revision).toString().trim())
// parse station image date
const Image = new Date(fs.readFileSync(Files.Image).toString())

export default Object.freeze({
    Image,
    Revision,
})