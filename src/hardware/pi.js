import os from 'os'
import { execSync } from 'child_process'

const Distribtuion = execSync('lsb_release -a').toString()
const Info = {}
Distribtuion.split('\n').forEach((line) => {
    const [key, value] = line.split(':')
    Info[key.trim()] = value.trim()
})

export default Info