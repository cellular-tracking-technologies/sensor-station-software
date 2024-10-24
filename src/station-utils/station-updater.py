#!/lib/ctt/.envs/station/bin/python3 
import requests
import subprocess
import datetime
import os

class StationUpdater:
    def __init__(self):
        self.station_id = self.getStationId()
        self.update_endpoint = 'https://station.internetofwildlife.com/station/v1/update'
        self.update_usb = '/mnt/usb/ctt/station-update.sh'
        self.tmp_file = '/tmp/station-update.sh'
        self.update_log = '/data/update-{}.log'.format(self.station_id)

    def getStationId(self):
        with open('/etc/ctt/station-id', 'r') as inFile:
            return inFile.read().strip()

    def getUpdateScript(self):
        # check if a bash script is available via USB drive
        if os.path.isfile(self.update_usb):
            print('identified station update on USB drive')
            with open(self.update_usb, 'r') as inFile:
                return inFile.read()

        # check the server for an update script if no usb script found
        print('checking server for an update')
        response = requests.post(self.update_endpoint, json={'id': self.station_id})
        if response.status_code == 200:
            return response.text

    def update(self):
        update_script = self.getUpdateScript()
        if update_script:
            with open(self.tmp_file, 'w') as outFile:
                outFile.write(update_script)
            with open(self.update_log, 'a') as outFile:
                # run bash script
                now = datetime.datetime.utcnow()
                outFile.write('{} - update\n'.format(now.strftime('%Y-%m-%d %H:%M:%S')))
                subprocess.Popen(['bash', self.tmp_file], stdout=outFile)

if __name__ == '__main__':
    updater = StationUpdater()
    updater.update()

    