import path from 'path'
import moment from 'moment'
import fs from 'fs'
import zlib from 'zlib'

/**
 * utility class for generating Filenames / Fileuris from the station id and base log directory
 */
export class FileManager {
  /**
   * 
   * @param {*} opts.id - base station id
   * @param {*} opts.base_log_dir - base log directory to store data files
   */
  constructor(opts) {
    this.id = opts.id
    this.base_log_dir = opts.base_log_dir
  }

  /**
   * 
   * @param {*} suffix - given file suffix, generate filename
   */
  getFileName(suffix) {
    return `CTT-${this.id}-${suffix}.csv`
  }

  /**
   * 
   * @param {*} suffix - given file suffix, generate file uri
   */
  getFileUri(suffix) {
    let filename = this.getFileName(suffix)
    return path.join(this.base_log_dir, filename)
  }

  /**
   * 
   * @param {*} filename - data file to copmress
   */
  compress(uri) {
    return new Promise((resolve, reject) => {
      // compress the data
      const inp = fs.createReadStream(uri)
      let outfilename = uri + '.gz'
      const out = fs.createWriteStream(outfilename)
      const gzip = zlib.createGzip()
      inp.pipe(gzip).pipe(out)
      out.on('close', () => {
        // finished compressing
        resolve(outfilename)
      })
      out.on('error', (err) => {
        // error with compressin stream
        reject(err)
      })
    })

  }

  /**
   * 
   * @param {opts.fileuri} fileuri 
   * @param {opts.new_basename} new_basename 
   */
  rotateDataFile(opts) {
    return new Promise((resolve, reject) => {
      // append date as suffix to data file
      let now = moment(new Date()).utc().format('YYYY-MM-DD_HHmmss')
      let newname = `${opts.new_basename.replace('.csv', '')}.${now}.csv`
      let rotated_uri = path.join(this.base_log_dir, 'rotated', newname)
      console.log('roated data file directory', rotated_uri)
      // ensure the rotated directory exists
      fs.mkdirSync(path.join(this.base_log_dir, 'rotated'), {
        recursive: true
      })

      // check if the file exists before rotating
      fs.access(opts.fileuri, (err) => {
        if (err) {
          // file does not exist - likely not collecting any data
          resolve(false)
          return
        }
        // file exists
        fs.rename(opts.fileuri, rotated_uri, (err) => {
          if (err) {
            // cannot rename
            reject(err)
            return
          }
          this.compress(rotated_uri).then((compressed_file_uri) => {
            // compression is complete 
            fs.unlink(rotated_uri, (err) => {
              // delete file
              if (err) {
                // error deleting file
                reject(err)
                return
              }
              // complete
              resolve(compressed_file_uri)
            })
          }).catch((err) => {
            reject(err)
          })
        })
      })
    })
  }
}
