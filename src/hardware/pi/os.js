import { execSync } from 'child_process'
import os from 'os'
import fs from 'fs'

const getDiskUsage = () => {
  const buffer = execSync('df').toString()
  const lines = buffer.split('\n')
  const root = lines.find(line => line.indexOf('/dev/root') >= 0)
  const vals = root.split(/\s+/)
  const space_total = parseInt(vals[1])
  const space_available = parseInt(vals[3])
  return {
    total: space_total,
    available: space_available
  }
}

const SoftwareUpdateFile = '/etc/ctt/station-software'

export default Object.freeze(() => {
  const software_update = fs.readFileSync(SoftwareUpdateFile).toString().trim()
  const disk_usage = getDiskUsage()
  return {
    software_update,
    disk_usage,
    loadavg_15min: os.loadavg()[2],
    free_mem: os.freemem(),
    total_mem: os.totalmem(),
    uptime: os.uptime(),
  }
})