#!/lib/ctt/.envs/station/bin/python3 
import datetime
import time
import json
import glob
import os
import logging
import shutil
import requests

logging.basicConfig(level=logging.INFO)

class StationUploader:
    def __init__(self):
        self.endpoint = "https://station.internetofwildlife.com/station/v2/upload"
        self.sg_file_dir = os.path.join('/', 'data', 'SGdata')
        self.rotated_dir = os.path.join('/', 'data', 'rotated')
        self.base_uploaded_dir = os.path.join('/', 'data', 'uploaded')
        self.ctt_uploaded_dir = os.path.join(self.base_uploaded_dir, 'ctt')
        self.sg_uploaded_dir = os.path.join(self.base_uploaded_dir, 'sg')
        self.hardware_server_port = 3000
        self.internet_check_ping_count = 3
        self.ensureDirs()
        self.station_id = self.getStationId()
        self.station_config_file = '/etc/ctt/station-config.json'

        self.TIMEOUT = 20
        self.MAX_ATTEMPTS = 3
        self.attempt = 0

    def getStationId(self):
        with open('/etc/ctt/station-id', 'r') as inFile:
            return inFile.read().strip()

    def ensureDirs(self):
        os.makedirs(self.ctt_uploaded_dir, exist_ok=True)
        os.makedirs(self.sg_uploaded_dir, exist_ok=True)

    def checkInternetStatus(self):
        url = 'https://station.internetofwildlife.com/status'

        try:
            res = requests.get(url)
        except Exception as err:
            logging.error(err)
            return False

        if (res.status_code == 200):
            return True
        return False

    def post(self, endpoint, headers, data):
        self.attempt += 1
        try:
            response = requests.post(endpoint, headers=headers, data=data, timeout=self.TIMEOUT)
            # check for a 204 response code for validation
            if response.status_code == 204:
                print('SUCCESS after {} tries'.format(self.attempt))
                self.attempt = 0
                return True
            print('invalid status reponse code', response.status_code)
            return False

        except Exception as err:
            print(err)
            print('failed {} of {} attempts'.format(self.attempt, self.MAX_ATTEMPTS))
            if self.attempt >= self.MAX_ATTEMPTS:
                print('exceeding attempts to upload file')
                return False
            else:
                return self.post(endpoint, headers, data)

    def uploadFile(self, fileuri, filetype):
        endpoint = self.endpoint
        if filetype == 'sg':
            endpoint = '{}/sg'.format(endpoint)
        else:
            endpoint = '{}/ctt'.format(endpoint)
        with open(fileuri, 'rb') as inFile:
            contents = inFile.read()
            headers = {
                'filename': os.path.basename(fileuri),
                'Content-Type': 'application/octet-stream'
            }
            return self.post(endpoint, headers=headers, data=contents)

    def rotateUploaded(self, fileuri, filetype):
        basename = os.path.basename(fileuri)
        if filetype == 'sg':
            uploaded_dir = self.sg_uploaded_dir
        else:
            uploaded_dir = self.ctt_uploaded_dir
        now = datetime.datetime.utcnow()
        uploaded_dir = os.path.join(uploaded_dir, now.strftime('%Y-%m-%d'))
        os.makedirs(uploaded_dir, exist_ok=True)
        newuri = os.path.join(uploaded_dir, basename)
        print('moving file', os.path.basename(fileuri), 'to', newuri)
        shutil.move(fileuri, newuri)

    def uploadAllCttFiles(self):
        filenames = glob.glob(os.path.join(self.rotated_dir, '*'))
        logging.info('about to upload {} CTT data files'.format(len(filenames)))
        if self.checkInternetStatus() is True:
            for filename in sorted(filenames):
                res = self.uploadFile(fileuri=filename, filetype='ctt')
                if res is False:
                    # if we cannot upload a file - don't upload the rest
                    print('problem uploading these files - stopping upload process')
                    return False
                self.rotateUploaded(fileuri=filename, filetype='ctt')
            return True
        else:
            print('no internet connection - not uploading anything')
        return False

    def uploadAllSgFiles(self):
        filenames = glob.glob(os.path.join(self.sg_file_dir, '*', '*.gz'))
        logging.info('about to upload {} SG files'.format(len(filenames)))
        now = datetime.datetime.utcnow()
        if self.checkInternetStatus() is True:
            for filename in sorted(filenames):

                delta = (time.time() - os.stat(filename).st_mtime) / 60.0 # minutes since last modified
                if delta  > 61:
                    # upload files older than 1 hour
                    res = self.uploadFile(fileuri=filename, filetype='sg')
                    if res is False:
                        print('problem uploading files - aborting upload')
                        return False
                    self.rotateUploaded(fileuri=filename, filetype='sg')
            return True
        else:
            print('no internet connection - not uploading anything')
        return False

    def getUploadStatus(self):
        status = None
        try:
            with open(self.station_config_file, 'r') as inFile:
                config = json.loads(inFile.read())
                status = config.get('upload')
        except Exception as err:
            print('error checking station config for upload status')
            print(err)
        return status

def go():
    uploader = StationUploader()
    default_status = {
        'ctt': True,
        'sensorgnome': True
    }
    # check on status on whether to upload data files
    status = uploader.getUploadStatus()
    if status is None:
        # if no status found - use default  - upload all
        status = default_status

    # init to true 
    upload_result = True
    if status['ctt'] is True:
        upload_result = uploader.uploadAllCttFiles()
    else:
        print('not uploading CTT files')

    if status['sensorgnome'] is True:
        # check prior upload result = continue if true
        if upload_result is True:
            # upload file if prior upload succeeded
            uploader.uploadAllSgFiles()
        else:
            print('not uploading sensorgnome files')

if __name__ == '__main__':
    go()
