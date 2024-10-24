let socket;
const initialize_websocket = function () {
  let url = 'ws://' + window.location.hostname + ':8001';
  socket = new WebSocket(url);
  socket.addEventListener('close', (event) => {
    alert('station connection disconnected');
  });
  socket.addEventListener('open', (event) => {
    console.log('opened websocket');
  });
  socket.onmessage = function (msg) {
    let data = JSON.parse(msg.data);
    switch (data.msg_type) {
      case 'log':
        document.querySelector('#terminal').textContent += data.data;
        break;
      default:
        break;
    }
  };
};

const init = function () {
  document.querySelector('#station-update').addEventListener('click', function (e) {
    res = confirm('Are you sure you want to run the station updater?  This requires a steady internet connection and a few minutes to complete.')
    if (res) {
      console.log('issuing update command');
      document.querySelector('#station-update').setAttribute('disabled', true);
      socket.send(JSON.stringify({
        cmd: 'update-station',
        msg_type: 'cmd'
      }));
    }
  });
};

(function () {
  initialize_websocket();
  init();
})();