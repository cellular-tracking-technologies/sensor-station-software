import { execSync } from 'child_process'

export default Object.freeze(() => {
  // use nmcli to get signal percent of connected wifi
  const result = execSync("nmcli -f IN-USE,SSID,SIGNAL dev wifi list | awk '/\*/{if (NR!=1) {print $2,$3}}'")
  // check there is a result
  if (result.length < 2) {
    return null
  }
  const [ssid, signal] = result.split()
  return { ssid, signal }
})