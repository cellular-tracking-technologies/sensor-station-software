import { execSync } from 'child_process'
import fs from 'fs'

const REBOOT_TEMPLATE = `#!/bin/bash
echo 'updating crontab'
tmp=/tmp/root-crontab
sudo crontab -l -u root | grep -v shutdown > $tmp
echo "WHEN /sbin/shutdown -r now" >> $tmp
sudo crontab -u root $tmp
rm $tmp
echo 'finished'
`

/**
 * 
 * @param {Object} opts 
 * @param {Number} opts.value
 * @param {Number} opts.max
 * @param {Number} opts.min
 * @returns {Null|Number|String}
 */
const validate = (opts) => {
  const {
    value,
    max,
    min
  } = opts
  // check if it's an asterisk
  if (typeof (value) === 'string') {
    if (value.trim() === '*') return '*'
  }
  // check if value is within range
  if (typeof (value) === 'number') {
    if (value >= min && value < max) {
      return value
    }
  }
}

const DefaultRebootSchedule = {
  Minute: 23,
  Hour: 4,
  Dom: '*',
  Mon: '*',
  Dow: 0,
}

export default Object.freeze({
  /**
   * get reboot schedule
   */
  GetRebootSchedule: () => {
    try {
      const cron_line = execSync('sudo crontab -l -u root | grep shutdown')
      const vals = cron_line.toString().split(/[ ,]+/)
      const [m, h, dom, mon, dow] = vals
      return {
        m,
        h,
        dom,
        mon,
        dow,
      }
    } catch (err) {
      console.log('error parsing reboot schedule')
      console.error(err)
      return null
    }
  },
  /**
   * @param {Object} opts
   * @param {Integer} opts.minute
   * @param {Integer} opts.hour
   * @param {Integer} opts.dom
   * @param {Integer} opts.mon
   * @param {Integer} opts.dow
   */
  UpdateRebootSchedule: (opts) => {
    const {
      minute: input_minute,
      hour: input_hour,
      dom: input_dom,
      mon: input_mon,
      dow: input_dow,
    } = opts
    console.log(opts)
    console.log(input_minute, input_hour, input_dom, input_mon, input_dow)
    let minute = validate({ value: input_minute, min: 0, max: 60 })
    minute = minute ? minute : DefaultRebootSchedule.Minute
    let hour = validate({ value: input_hour, min: 0, max: 24 })
    hour = hour ? hour : DefaultRebootSchedule.Hour
    let dom = validate({ value: input_dom, min: 1, max: 32 })
    dom = dom ? dom : DefaultRebootSchedule.Dom
    let mon = validate({ value: input_mon, min: 1, max: 13 })
    mon = mon ? mon : DefaultRebootSchedule.Mon
    let dow = validate({ value: input_dow, min: 0, max: 7 })
    dow = dow ? dow : DefaultRebootSchedule.Dow

    const when = `${minute} ${hour} ${dom} ${mon} ${dow}`
    const script = REBOOT_TEMPLATE.replace(/WHEN/, when)
    console.log('writing file', script)
    const filename = '/tmp/update-reboot-schedule.sh'
    fs.writeFileSync(filename, script)
    console.log('about to execute crontab replacement')
    execSync(`/bin/bash ${filename}`)
  },
})