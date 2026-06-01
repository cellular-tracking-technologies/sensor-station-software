#!/bin/bash
home='/usr/lib/ctt'
user_perm='ctt:ctt'
sudo mkdir -p $home
cd $home
git_url='https://github.com/cellular-tracking-technologies/sensor-station-software.git'

check_run() {
  echo "$changed_files" | grep --quiet "$1" && eval "$2"
}

dir="$home/sensor-station-software"
# change permissions to ctt user to be safe
sudo chown -R $user_perm $dir
# check if the software directory exists
if [ -d $dir ]; then
  # directory exists - stash any changes and do a git pull
  cd $dir
  git config --global --add safe.directory $dir
  git stash
  git pull
  # change permissions to ctt user after pull to be sure all files have same permissions
  sudo chown -R $user_perm $dir
  # checking if package.json has changed
  changed_files="$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD)"
  check_run package.json "npm install"
  # Run modular OTA hooks. Each hook is idempotent (no-op when dest matches
  # source) and only reloads its subsystem when something actually changed.
  # Add new hooks here (one per subsystem) rather than expanding existing ones.
  sudo bash $dir/system/scripts/hooks/install-nm-connections.sh
  sudo bash $dir/system/scripts/hooks/install-udev-rules.sh
else
  cd $home
  echo "cloning sensor-station-software repo to $dir"
  git clone $git_url
  cd $dir
  npm install
fi

sudo sh -c "date -u +'%Y-%m-%d %H:%M:%S' > /etc/ctt/station-software"

# run the initialize script to ensure station files are written from i2c chips
sudo /usr/local/bin/node /lib/ctt/sensor-station-software/src/hardware/initialize.js

echo '*******************************************'
echo 'CTT Sensor Station Software Update Complete'
echo '*******************************************'

sudo systemctl restart station-hardware-server
sudo systemctl restart station-lcd-interface
sudo systemctl restart station-radio-interface
sudo systemctl restart station-web-interface

echo '********************'
echo 'Updating Sensorgnome'
echo '********************'

# pull sensorgnome code updates
dir="$home/sensorgnome/sensorgnome"
# change user permissions of sensorgnome directory to be safe
sudo chown -R $user_perm $dir
cd $dir
git config --global --add safe.directory /usr/lib/ctt/sensor-station-software
git stash
git pull
sudo chown -R $user_perm $dir
git config --global --add safe.directory $dir
changed_files="$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD)" 
check_run package.json "npm install"
sudo systemctl restart sensorgnome

echo
echo 'Checking for OTA updates'
bash-update-station
echo 
echo '***********************'
echo 'STATION UPDATE COMPLETE'
echo '***********************'

echo 'REBOOTING STATION'
sudo reboot