import StationRevision from '../../revision.js'

let blu_filemap

if (StationRevision.revision >= 3) {
    blu_filemap = '/lib/ctt/sensor-station-software/system/radios/v3-blu-radio-map.js'
} else {
    blu_filemap = '/lib/ctt/sensor-station-software/system/radios/v2-blu-radio-map.js'
}

export default blu_filemap
