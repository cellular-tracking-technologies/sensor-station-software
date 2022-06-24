import fs from 'fs'

export default async () => {
  return fs.readFileSync('/etc/ctt/station-id').toString().trim()
}
