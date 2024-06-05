import { execSync } from 'child_process'

const Distribution = execSync('lsb_release -a').toString().trim()
const Info = {}
Distribution.split('\n').forEach((line) => {
    const [key, value] = line.split(':')
    Info[key.trim()] = value.trim()
})
Info['Release'] = parseInt(Info['Release'])

export default Info