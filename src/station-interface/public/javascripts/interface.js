let beeps = [];
let blu_beeps = [];
let tags = new Set();
let nodes = {};
let beep_hist = {};
let beep_channels = [];
let blu_stats = {};
let blu_ports = []
let unlink_port
// let poll_interval = 10000;
let poll_interval;
let filter
let umacr = '\u016B';

console.log('tag filter filter initial value', filter)

const DATE_FMT = 'YYYY-MM-DD HH:mm:ss';
let socket;

const setText = function (tag, value) {
  let id = '#' + tag;
  document.querySelector(id).textContent = value;
};

const clear_table = function (table) {
  while (table.firstChild.nextSibling) {
    table.removeChild(table.firstChild.nextSibling);
  }
};

const clear = function () {
  beeps = [];
  nodes = {};
  tags.clear();
  beep_hist = {};

  document.querySelectorAll('.radio').forEach(function (radio_table) {
    clear_table(radio_table);
    clear_table(document.querySelector('#tags'));
  });
};

const download_node_health = function () {
  let lines = [];
  let keys = [
    'RecordedAt',
    'NodeId',
    'Battery',
    'NodeRSSI',
    'Latitude',
    'Longitude',
    'Firmware'
  ];
  lines.push(keys);
  let record;
  let node_health;
  Object.keys(nodes).forEach(function (node_id) {
    node_health = nodes[node_id];
    node_health.NodeId = node_id;
    record = [];
    keys.forEach(function (key) {
      record.push(node_health[key]);
    });
    lines.push(record);
  });
  try {
    lines.unshift("data:text/csv;charset=utf-8,");
    let csvContent = lines.join('\r\n');
    let encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "node-report.csv");
    document.body.appendChild(link); // Required for FF
    link.click();
  } catch (err) {
    let csvContent = lines.join('\r\n');
    navigator.msSaveBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), "node-report.csv");
  }
};

const initialize_controls = function () {
  document.querySelector('#max-row-count').value = MAX_ROW_COUNT
  document.querySelector('#update-max-row-count').addEventListener('click', function (e) {
    MAX_ROW_COUNT = document.querySelector('#max-row-count').value
    localStorage.setItem('max-row-count', MAX_ROW_COUNT)
    clip_beep_tables()
  })

  document.querySelector('#restart-radios').addEventListener('click', function (e) {
    let result = confirm('Are you sure you want to restart the radio software?')
    if (result) {
      document.querySelector('#restart-radios').setAttribute('disabled', true)
      $.ajax({
        url: '/radio-restart',
        method: 'post',
        success: function (res) {
          alert('Radio server has been restarted - you will need to refresh the page.')
        },
        error: function (err) {
          alert('error restarting radio software')
        }
      })
    }
  });
  document.querySelector('#download-nodes').addEventListener('click', function (evt) {
    download_node_health();
  });
  document.querySelector('#upload-files').addEventListener('click', function (evt) {
    socket.send(JSON.stringify({
      msg_type: 'cmd',
      cmd: 'upload',
    }));
    document.querySelector('#upload-files').setAttribute('disabled', true);
  });
  document.querySelector('#start-modem').addEventListener('click', function (e) {
    let res = window.confirm('Are you sure you want to start the modem?');
    if (res) {
      $.ajax({
        url: '/modem/start',
        method: 'post',
        success: function (res) {
          alert('Modem startup initiated');
        }
      })
    }
  });
  document.querySelector('#stop-modem').addEventListener('click', function (e) {
    let res = window.confirm('WARNING: Are you sure you want to stop the modem?');
    if (res) {
      $.ajax({
        url: '/modem/stop',
        method: 'post',
        success: function (res) {
          alert('Stopping modem connection');
        }
      })
    }
  });
  document.querySelector('#enable-modem').addEventListener('click', function (e) {
    let res = window.confirm('Are you sure you want to enable the modem?');
    if (res) {
      $.ajax({
        url: '/modem/enable',
        method: 'post',
        success: function (res) {
          alert('Modem enabled');
        }
      })
    }
  });
  document.querySelector('#disable-modem').addEventListener('click', function (e) {
    let res = window.confirm('WARNING: Are you sure you want to PERMANENTLY diable the modem?');
    if (res) {
      $.ajax({
        url: '/modem/disable',
        method: 'post',
        success: function (res) {
          alert('Modem disabled');
        }
      })
    }
  });

  document.querySelectorAll('button[name="toggle_node_radio"]').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      let radio_id = e.target.getAttribute('value');
      let res = window.confirm('Are you sure you want to toggle NODE listening mode for radio ' + radio_id + '?');
      if (res) {
        document.querySelector(`#config_radio_${radio_id}`).textContent = 'Node'
        socket.send(JSON.stringify({
          msg_type: 'cmd',
          cmd: 'toggle_radio',
          data: {
            type: 'node',
            channel: radio_id
          }
        }));
      }
    });
  });
  document.querySelectorAll('button[name="toggle_tag_radio"]').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      let radio_id = e.target.getAttribute('value');
      let res = window.confirm('Are you sure you want to toggle TAG listening mode for radio ' + radio_id + '?');
      if (res) {
        document.querySelector(`#config_radio_${radio_id}`).textContent = 'Tag'
        socket.send(JSON.stringify({
          msg_type: 'cmd',
          cmd: 'toggle_radio',
          data: {
            type: 'tag',
            channel: radio_id
          }
        }));
      }
    });
  });
  document.querySelectorAll('button[name="toggle_ook_radio"]').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      let radio_id = e.target.getAttribute('value');
      let res = window.confirm('Are you sure you want to toggle OOK listening mode for radio ' + radio_id + '?');
      if (res) {
        document.querySelector(`#config_radio_${radio_id}`).textContent = 'OOK'
        socket.send(JSON.stringify({
          msg_type: 'cmd',
          cmd: 'toggle_radio',
          data: {
            type: 'ook',
            channel: radio_id
          }
        }));
      }
    });
  });


  document.querySelector('#clear').addEventListener('click', (evt) => {
    clear();
  });
  document.querySelector('#reboot').addEventListener('click', (evt) => {
    let res = window.confirm('Are you sure you want to reboot?');
    if (res) {
      $.ajax({
        url: '/reboot',
        method: 'post',
        success: function (data) {
          alert('rebooting');
        },
        error: function (err) {
          alert('error trying to reboot', err.toString());
        }
      });
    }
  });
  document.querySelector('#clear-log').addEventListener('click', (evt) => {
    let res = window.confirm('Are you sure you want to clear the log file?');
    if (res) {
      $.ajax({
        url: '/clear-log',
        method: 'post',
        success: function (data) {
          alert('Clear Log Success');
        },
        error: function (err) {
          alert('error clearing log file', err.toString());
        }
      });
    }
  });
  document.querySelector('#save-deployment').addEventListener('click', (evt) => {
    let data = document.querySelector('#sg-deployment');
    $.ajax({
      url: '/save-sg-deployment',
      method: 'post',
      data: {
        contents: data.value
      },
      success: function (data) {
        alert('saved sg deployment file to disk');
      },
      error: function (err) {
        alert('error saving sg deployment file ' + err.toString());
      }
    });
  });
  document.querySelector('#server-checkin').addEventListener('click', function (evt) {
    socket.send(JSON.stringify({
      msg_type: 'cmd',
      cmd: 'checkin',
      data: {}
    }));
    document.querySelector('#server-checkin').setAttribute('disabled', true);
    setTimeout(function () {
      document.querySelector('#server-checkin').removeAttribute('disabled');
    }, 5000)
  });
  document.querySelectorAll('button[name="delete-data"]').forEach((btn) => {
    btn.addEventListener('click', (evt) => {
      let dataset = evt.target.value;
      let result = window.confirm('Are you sure you want to delete all files for ' + dataset);
      let url;
      if (result) {
        switch (dataset) {
          case ('ctt-uploaded'):
            url = '/delete-ctt-data-uploaded';
            break;
          case ('ctt-rotated'):
            url = '/delete-ctt-data-rotated';
            break;
          case ('sg-uploaded'):
            url = '/delete-sg-data-uploaded';
            break;
          case ('sg-rotated'):
            url = '/delete-sg-data-rotated';
            break;
          default:
            alert('invalid dataset to delete');
        }
        $.ajax({
          url: url,
          method: 'post',
          success: function (data) {
            if (data.res) {
              alert('delete success');
            }
          },
          error: function (err) {
            alert('error deleting files', err.toString());
          }
        });
        return;
      }
    });
  });

  let tag_filter = document.getElementById("tag-filter")
  tag_filter.addEventListener('input', (e) => {
    let input, table, tr, td, i, txtValue
    input = document.getElementById('tag-filter-input')
    console.log('tag filter input', input)
    filter = input.value.toUpperCase()
    console.log('tag filter value', filter)

    // table = document.getElementsByClassName('table table-sm table-bordered table-dark radio')
    Object.values(document.getElementsByClassName('table table-sm table-bordered table-dark radio')).forEach((table) => {
      console.log('tag filter tables', table)

      tr = table.getElementsByTagName('tr')
      console.log('tag filter tr', tr)

      for (i = 0; i < tr.length; i++) {
        td = tr[i].getElementsByTagName('td')[1]
        console.log('tag filter td', td)
        if (td) {
          txtValue = td.textContent || td.innterText
          console.log('tag filter txtValue', txtValue)

          if (txtValue.toUpperCase().indexOf(filter) > -1) {
            tr[i].style.display = ""
          } else {
            tr[i].style.display = "none"
          }
        }
      }
    })
  }) //end of get tables forEach loop

};



const initialize_blu_controls = function () {
  // Blu Buttons
  document.querySelectorAll('button[name="toggle_radio_on"]').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      let port = e.target.getAttribute('value')

      let res = window.prompt(`Turning on all Bl${umacr} Radios on USB Port ${port} and setting polling interval as:`);
      res = Number(res)
      if (isNaN(res) === true || res === 0) {
        window.alert('Invalid Input, please enter an integer (number with no decimals).')
      } else {
        socket.send(JSON.stringify({
          msg_type: 'cmd',
          cmd: 'toggle_blu',
          data: {
            type: 'blu_on',
            // channel: radio_id,
            port: port,
            poll_interval: res,
            scan: 1,
            rx_blink: 1,
          }
        }));
      }
    })
  })

  // document.querySelectorAll('button[name="toggle_radio_on"]').forEach((btn) => {
  //   console.log('blu btn', btn)
  //   btn.addEventListener('click', function (e) {
  //     let radio_id = e.target.getAttribute('value');
  //     let res = window.prompt(`Turning on Radio ${radio_id} and setting polling interval as:`);
  //     // if (res) {
  //       res = Number(res)
  //       console.log('polling res', res, typeof res)
  //       if (isNaN(res) === true || res === 0) {
  //         window.alert('Invalid Input, please enter an integer (number with no decimals).')
  //       // } else if (res === 0) {
  //       //   window.alert('Invalid Input, please enter an integer (number with no decimals).')
  //       } else {
  //       document.querySelector(`#config_radio_${radio_id}`).textContent = 'Radio On'
  //       socket.send(JSON.stringify({
  //         msg_type: 'cmd',
  //         cmd: 'toggle_blu',
  //         data: {
  //           type: 'blu_on',
  //           // channel: radio_id,
  //           poll_interval: res,
  //           scan: 1,
  //           rx_blink: 1,
  //         }
  //       }));
  //     }
  //   });
  // });
  document.querySelectorAll('button[name="toggle_radio_off"]').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      let port = e.target.getAttribute('value')

      let res = window.confirm(`Are you sure you want to turn all Bl${umacr} Series Radios off on USB Port ${port}?`);
      if (res) {
        socket.send(JSON.stringify({
          msg_type: 'cmd',
          cmd: 'toggle_blu',
          data: {
            type: 'blu_off',
            // channel: radio_id,
            port: port,

            scan: 0,
            rx_blink: 0,
          }
        }));
      }
    })
  })
  // document.querySelectorAll('button[name="toggle_radio_off"]').forEach((btn) => {
  //   btn.addEventListener('click', function (e) {
  //     let radio_id = e.target.getAttribute('value');
  //     let res = window.confirm('Are you sure you want to switch Blu Series Radio' + radio_id + ' off?');
  //     if (res) {
  //       document.querySelector(`#config_radio_${radio_id}`).textContent = 'Radio Off'
  //       socket.send(JSON.stringify({
  //         msg_type: 'cmd',
  //         cmd: 'toggle_blu',
  //         data: {
  //           type: 'blu_off',
  //           channel: radio_id,
  //           scan: 0,
  //           rx_blink: 0,
  //         }
  //       }));
  //     }
  //   });
  // });
  document.querySelectorAll('button[name="toggle_radio_led_on"]').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      // console.log('blu button radio on event', e)
      // let radio_id = e.target.getAttribute('value');
      let port = e.target.getAttribute('value');
      let res = window.confirm(`Are you sure you want to switch Blu Series Radios on USB Port ${port} LED On?`);
      if (res) {
        document.querySelector(`#config_radio_${port}`).textContent = 'Radio LED On'
        socket.send(JSON.stringify({
          msg_type: 'cmd',
          cmd: 'toggle_blu_led',
          data: {
            type: 'led_on',
            // channel: radio_id,
            port: port,
            scan: 1,
            rx_blink: 1,
          }
        }));
      }
    });
  });
  document.querySelectorAll('button[name="toggle_radio_led_off"]').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      // let radio_id = e.target.getAttribute('value');
      let port = e.target.getAttribute('value')
      let res = window.confirm(`Are you sure you want to switch Blu Series Radio LEDs on USB Port ${port} Off?`);
      if (res) {
        document.querySelector(`#config_radio_${port}`).textContent = 'Radio LED Off'
        socket.send(JSON.stringify({
          msg_type: 'cmd',
          cmd: 'toggle_blu_led',
          data: {
            type: 'led_off',
            // channel: radio_id,
            port: port,
            scan: 1,
            rx_blink: 0,
          }
        }));
      }
    });
  });
  document.querySelectorAll('button[name="reboot_blu_radio"]').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      // let radio_id = e.target.getAttribute('value');
      let port = e.target.getAttribute('value')

      let res = window.confirm(`Are you sure you want to reboot Radio radio_id on USB Port ${port}?`);
      if (res) {
        document.querySelector(`#config_radio_${port}`).textContent = 'Reboot Radio'
        socket.send(JSON.stringify({
          msg_type: 'cmd',
          cmd: 'reboot_blu_radio',
          data: {
            type: 'reboot_blu_radio',
            // channel: radio_id,
            port: port,
          }
        }));
      }
    });
  });
  document.querySelectorAll('button[name="radio_polling"]').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      // let radio_id = e.target.getAttribute('value');
      let port = e.target.getAttribute('value')

      let res = window.prompt('Enter polling interval in milliseconds (ms) for USB Port ' + port +
        ' radios.\n Warning! DO NOT enter a value below 100 ms, otherwise it will crash the program.');
      res = Number(res)
      poll_interval = res ? res : 10000
      // console.log('polling res', res, typeof res)
      if (isNaN(res) === true || res === 0) {
        window.alert('Invalid Input, please enter an integer (number with no decimals).')
      } else {
        document.querySelector(`#config_radio_${port}`).textContent = 'Change Polling Interval (Default is 10000 ms)'
        socket.send(JSON.stringify({
          msg_type: 'cmd',
          cmd: 'change_poll',
          data: {
            type: 'change_poll',
            poll_interval: res,
            port: port,
            // channel: radio_id,
          }
        }));
      }
    });
  });
  document.querySelectorAll('button[name="update_blu_firmware"]').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      // let radio_id = e.target.getAttribute('value');
      let port = e.target.getAttribute('value')

      let res = window.confirm('Are you sure you want to update Blu Series Radios on USB Port ' + port + '?');
      if (res) {
        document.querySelector(`#config_radio_${port}`).textContent = 'Radio Updated to Latest Firmware'
        socket.send(JSON.stringify({
          msg_type: 'cmd',
          cmd: 'update-blu-firmware',
          data: {
            type: 'update-firmware',
            // channel: radio_id,
            port: port,
            poll_interval: 10000,
          }
        }));
      }
    });
  });

  document.querySelectorAll('#main-radio-switch').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      console.log('display main radio switch clicked', document.querySelector('#mainRadiosSwitch'))
      if (document.querySelector('#main-radios').style.display !== 'none') {
        document.querySelector('#main-radios').style.display = 'none'

      } else {
        document.querySelector('#main-radios').style.display = ''

      }
    })
  })

  document.querySelectorAll('#dongle-radio-switch').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      console.log('display dongle radio switch clicked', document.querySelector('#dongleRadiosSwitch'))
      // if (document.querySelector('#dongles').style.display !== 'none') {

      if (document.querySelector('#dongles').style.display !== 'none') {
        document.querySelector('#dongles').style.display = 'none'

      } else {
        document.querySelector('#dongles').style.display = ''

      }
      // }
    })
  })

  document.querySelectorAll('#blu-receiver-switch').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      console.log('display blu radio switch clicked', document.querySelector('#blu-switch'))
      if (document.querySelector('#blu-receiver').style.display !== 'none') {
        document.querySelector('#blu-receiver').style.display = 'none'

      } else {
        document.querySelector('#blu-receiver').style.display = 'block'

      }
    })
  })
}

const format_beep = function (beep) {
  // console.log('format beep', beep)
  if (beep.data) {
    let tag_id, rssi, node_id, tag_at, blu_channel, data_type, port;
    let beep_at = moment(new Date(beep.received_at)).utc();
    tag_at = beep_at;
    if (beep.protocol) {
      if (beep.meta.data_type == 'blu_tag') {
        // console.log('blu tag is being formatted')
        // blu_channel = beep.blu_channel;
        blu_channel = beep.channel;
        tag_id = beep.id;
        rssi = beep.rssi;
        tag_at = beep_at;
        data_type = beep.meta.data_type
        port = beep.port
      }
      // new protocol
      if (beep.meta.data_type == 'node_coded_id') {
        node_id = beep.meta.source.id;
        rssi = beep.data.rssi;
        tag_id = beep.data.id;
        tag_at = moment(new Date(beep.data.rec_at * 1000)).utc();
      }
      if (beep.meta.data_type == 'coded_id') {
        rssi = beep.meta.rssi;
        tag_id = beep.data.id;
        tag_at = beep_at;
      }
      if (beep.meta.data_type == 'telemetry') {
        tag_id = beep.meta.source.id;
        rssi = beep.meta.rssi;
        tag_at = moment(new Date(beep.data.time * 1000)).utc();
      }
    }
    // console.log('wtf is beep data', beep.data)
    // console.log('blu channel', blu_channel)
    if (beep.data.tag) {
      tag_id = beep.data.tag.id;
      rssi = beep.rssi;
    }
    // if (beep.data.blu_tag){
    //   tag_id = beep.data.tag.id;
    //   rssi = beep.rssi;
    //   channel = null;
    //   blu_channel = beep.blu_channel;
    //   data_type = beep.meta.data_type;
    // }
    if (beep.data.node_tag) {
      tag_id = beep.data.node_tag.tag_id;
      rssi = beep.data.node_beep.tag_rssi;
      node_id = beep.data.node_beep.id;
      tag_at = beep_at.subtract(beep.data.node_beep.offset_ms)
    }

    let data = {
      tag_id: tag_id,
      node_id: node_id,
      rssi: rssi,
      channel: beep.channel,
      blu_channel: blu_channel,
      received_at: beep_at,
      tag_at: tag_at,
      data_type: data_type,
      port: port ?? null,
    }

    // console.log('format beep data', data)
    return data
  }
}

const format_node_health = function (msg) {
  let node_id, rssi, batt, temp, fw, sol_v, sol_ma, sum_sol_ma, fix_at, lat, lng;
  if (msg.protocol) {
    node_id = msg.meta.source.id;
    fw = msg.data.fw;
    rssi = msg.meta.rssi;
    lat = msg.data.lat / 1000000;
    lng = msg.data.lon / 1000000;
    batt = msg.data.bat_v / 100;
    sol_v = msg.data.sol_v;
    sol_ma = msg.data.sol_ma;
    sum_sol_ma = msg.data.sum_sol_ma;
    temp_c = msg.data.temp_c;
    fix_at = moment(new Date(msg.data.fix_at * 1000)).utc();
  }
  if (msg.data.node_alive) {
    node_id = msg.data.node_alive.id;
    rssi = msg.rssi;
    batt = msg.data.node_alive.battery_mv / 1000;
    temp_c = msg.data.node_alive.celsius;
    fw = msg.data.node_alive.firmware;
  }
  let data = {
    node_id: node_id,
    fw: fw,
    rssi: rssi,
    lat: lat,
    lng: lng,
    battery: batt,
    sol_v: sol_v,
    sol_ma: sol_ma,
    sum_sol_ma: sum_sol_ma,
    fix_at: fix_at,
    received_at: moment(new Date(msg.received_at)).utc(),
    channel: msg.channel
  }
  return data;
}


const handle_beep = function (beep) {
  // console.log('handle beep beep', beep)
  if (beep.protocol) {
    switch (beep.meta.data_type) {
      case 'coded_id':
        handle_tag_beep(format_beep(beep));
        break;
      case 'node_coded_id':
        handle_tag_beep(format_beep(beep));
        break;
      case 'node_health':
        break;
      case 'telemetry':
        handle_tag_beep(format_beep(beep));
        break;
      case 'blu_tag':
        handle_blu_beep(format_beep(beep));
        poll_interval = beep.poll_interval;
        break;
      default:
        break;
    }
    return;
  }
  if (beep.data) {
    if (beep.data.node_alive) {
      return;
    }
    if (beep.data.node_beep) {
      handle_tag_beep(format_beep(beep));
    }
  }
};

const handle_blu_beep = function (beep) {
  // console.log('handle blu beep', beep)
  let tag_id = beep.tag_id.toUpperCase();
  let port = beep.port.toString()
  let channel = beep.channel.toString()
  // console.log('handle blu beep port', port, 'channel', channel)
  if (blu_ports.includes(port)) {
    // console.log('blu ports, port is present', port)
  } else {
    // console.log('blu ports adding unique port', port)
    blu_ports.push(port)
  }

  // console.log('blu ports', blu_ports)
  blu_ports.forEach((port) => {

    // if (BLU_ENABLED == false) {
    // if (port) {
    // BLU_ENABLED = true
    document.querySelector(`#blu-receiver-${port}`).style.display = 'block'

    //   }
    // }
  })

  if (unlink_port > 0) {
    console.log('handle blu beep unlink port', unlink_port)
    document.querySelector(`#blu-receiver-${unlink_port}`).style.display = 'none'
    let unlink_index = blu_ports.findIndex(port => port === unlink_port.toString())
    blu_ports.splice(unlink_index, 1)
    console.log('handle blu beep unlink blu ports', blu_ports)
    unlink_port = null
    console.log('handle blu beep unlink port after null', unlink_port)
  }

  build_blu_stats(port, channel)

  let BLU_TABLE = document.querySelector('#blu-radio_' + port + '-' + beep.blu_channel);
  // // console.log('blu table', BLU_TABLE)
  // BLU_PORT.appendChild(BlU_TABLE)

  let tr = document.createElement('tr');
  tr.style.border = "2px solid #22dd22"; // all blu beeps are validated so green outline
  let td = document.createElement('td');
  td.textContent = beep.tag_at.format(DATE_FMT);
  // console.log('blu beep date', td.textContent)
  tr.appendChild(td);
  let alias = localStorage.getItem(tag_id);
  if (alias) {
    tr.appendChild(createElement(alias));
  } else {
    tr.appendChild(createElement(tag_id));
  }

  if (tag_id === filter || filter === undefined) {
    tr.style.display = ""
  } else {
    tr.style.display = "none"
  }

  tr.appendChild(createElement(beep.rssi));
  tr.appendChild(createElement(beep.node_id));
  // console.log('blu tr', tr)
  // console.log('blu table', BLU_TABLE)

  // remove last beep record if table exceeds max row count
  // if (BLU_TABLE.children.length > MAX_ROW_COUNT) {
  // if (BLU_TABLE.children.length > 1000) {
  //   BLU_TABLE.removeChild(BLU_TABLE.lastElementChild)
  // }
  BLU_TABLE.insertBefore(tr, BLU_TABLE.firstChild.nextSibling);
  // console.log('blu table 2', BLU_TABLE)
  // console.log('blu table beep', beep)

  blu_beeps.push(beep);
  // } // end of blu port for loop
  // console.log('blu table beeps', blu_beeps)

  let beep_count = beep_hist[tag_id];
  // console.log('beep count', beep_count)
  if (tags.has(tag_id)) {
    beep_hist[tag_id] += 1;
    document.querySelector('#cnt_' + tag_id).textContent = beep_hist[tag_id];
    document.querySelector('#rate_' + tag_id).textContent = (beep_hist[tag_id] / (document.timeline.currentTime / 1000)).toFixed(2)
  } else {
    beep_hist[tag_id] = 1;
    tags.add(tag_id);
    let TAG_TABLE = document.querySelector('#tags');
    tr = document.createElement('tr');
    td = createElement(tag_id);
    tr.appendChild(td);
    td = document.createElement('td');
    td.setAttribute('id', 'cnt_' + tag_id);
    td.textContent = beep_hist[tag_id];
    tr.appendChild(td);

    td = document.createElement('td');
    td.setAttribute('id', 'rate_' + tag_id);
    td.textContent = (beep_hist[tag_id] / (document.timeline.currentTime / 1000)).toFixed(2);
    tr.appendChild(td);

    let input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('class', 'form-input');
    let alias = localStorage.getItem(tag_id);
    if (alias) {
      input.setAttribute('value', alias);
    }
    td = document.createElement('td');
    td.appendChild(input);
    tr.appendChild(td);
    td = document.createElement('td');
    let button = document.createElement('button');
    button.setAttribute('class', 'btn btn-sm btn-primary tag-alias');
    button.textContent = 'Update';
    button.setAttribute('value', tag_id);
    button.addEventListener('click', (evt) => {
      let tag_id = evt.target.getAttribute('value');
      let alias = evt.target.parentElement.previousSibling.firstChild.value;
      localStorage.setItem(tag_id, alias);
    });
    td.appendChild(button);
    tr.appendChild(td);

    button = document.createElement('button');
    button.setAttribute('class', 'btn btn-sm btn-danger');
    button.textContent = 'Remove';
    button.addEventListener('click', (evt) => {
      x = evt;
      let row = evt.target.parentElement.parentElement;
      let tag_id = row.firstChild.firstChild.textContent
      tags.delete(tag_id);
      row.remove();
    });
    td = document.createElement('td');
    td.appendChild(button);
    tr.appendChild(td);

    TAG_TABLE.appendChild(tr);
    //TAG_TABLE.insertBefore(tr, TAG_TABLE.firstChild.nextSibling);
  }
}

let DONGLES_ENABLED = false;
let BLU_ENABLED = false;
let MAX_ROW_COUNT = 1000;

const clip_beep_tables = function () {
  let children
  document.querySelectorAll('.radio').forEach(function (table) {
    children = []
    table.childNodes.forEach(function (child) {
      children.push(child)
    })
    children.slice(MAX_ROW_COUNT, table.children.length).forEach(function (child) {
      table.removeChild(child)
    })
  })
}

const handle_tag_beep = function (beep) {
  // console.log('handle tag beep', beep)
  let validated = false;
  let tag_id = beep.tag_id;

  if (tag_id.length > 8) {
    tag_id = tag_id.slice(0, 8);
    validated = true;
  }
  if (DONGLES_ENABLED == false) {
    if (beep.channel > 5) {
      DONGLES_ENABLED = true
      document.querySelector('#dongles').style.display = 'block'
      document.querySelector('#dongleRadioSwitch').style.display = 'block'
      document.querySelector('#dongleRadioLabel').style.display = 'block'
    }
  }

  let BEEP_TABLE = document.querySelector('#radio_' + beep.channel); // creates table for individual beeps
  let tr = document.createElement('tr');

  if (validated == true) {
    tr.style.border = "2px solid #22dd22";
  } else {
    tr.style.border = "2px solid red";
  }

  let td = document.createElement('td');
  td.textContent = beep.tag_at.format(DATE_FMT);
  tr.appendChild(td);
  let alias = localStorage.getItem(tag_id);

  if (alias) {
    tr.appendChild(createElement(alias));
  } else {
    tr.appendChild(createElement(tag_id));
  }

  if (tag_id === filter || filter === undefined) {
    tr.style.display = ""
  } else {
    tr.style.display = "none"
  }

  tr.appendChild(createElement(beep.rssi));
  tr.appendChild(createElement(beep.node_id));
  // remove last beep record if table exceeds max row count
  if (BEEP_TABLE.children.length > MAX_ROW_COUNT) {
    BEEP_TABLE.removeChild(BEEP_TABLE.lastElementChild)
  }
  // console.log('regular radio', BEEP_TABLE)
  BEEP_TABLE.insertBefore(tr, BEEP_TABLE.firstChild.nextSibling);
  beeps.push(beep);
  // console.log('regular beeps', beeps)
  let beep_count = beep_hist[tag_id];
  if (tags.has(tag_id)) {
    beep_hist[tag_id] += 1;
    document.querySelector('#cnt_' + tag_id).textContent = beep_hist[tag_id];
    document.querySelector('#rate_' + tag_id).textContent = (beep_hist[tag_id] / (document.timeline.currentTime / 1000)).toFixed(2);

  } else {
    beep_hist[tag_id] = 1;
    tags.add(tag_id);
    let TAG_TABLE = document.querySelector('#tags');
    tr = document.createElement('tr');
    td = createElement(tag_id);
    tr.appendChild(td);
    td = document.createElement('td');
    td.setAttribute('id', 'cnt_' + tag_id);
    td.textContent = beep_hist[tag_id];
    tr.appendChild(td);

    td = document.createElement('td');
    td.setAttribute('id', 'rate_' + tag_id);
    td.textContent = (beep_hist[tag_id] / (document.timeline.currentTime / 1000)).toFixed(2);
    tr.appendChild(td);

    let input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('class', 'form-input');
    let alias = localStorage.getItem(tag_id);
    if (alias) {
      input.setAttribute('value', alias);
    }
    td = document.createElement('td');
    td.appendChild(input);
    tr.appendChild(td);
    td = document.createElement('td');
    let button = document.createElement('button');
    button.setAttribute('class', 'btn btn-sm btn-primary tag-alias');
    button.textContent = 'Update';
    button.setAttribute('value', tag_id);
    button.addEventListener('click', (evt) => {
      let tag_id = evt.target.getAttribute('value');
      let alias = evt.target.parentElement.previousSibling.firstChild.value;
      localStorage.setItem(tag_id, alias);
    });
    td.appendChild(button);
    tr.appendChild(td);

    button = document.createElement('button');
    button.setAttribute('class', 'btn btn-sm btn-danger');
    button.textContent = 'Remove';
    button.addEventListener('click', (evt) => {
      x = evt;
      let row = evt.target.parentElement.parentElement;
      let tag_id = row.firstChild.firstChild.textContent
      tags.delete(tag_id);
      row.remove();
    });
    td = document.createElement('td');
    td.appendChild(button);
    tr.appendChild(td);

    TAG_TABLE.appendChild(tr);
    //TAG_TABLE.insertBefore(tr, TAG_TABLE.firstChild.nextSibling);
  }
};

const createElement = function (text) {
  let td = document.createElement('td');
  td.textContent = text;
  return td;
};

const handle_stats = function (stats) {
  // console.log('handle stats', stats)
  let record;
  let reports = {};
  let received_at, old_received_at;
  let n = 0;
  let channel_stats = {}
  // let blu_stats = {}
  if (stats.channels) {

    Object.keys(stats.channels).forEach(function (channel) {
      let channel_data = stats.channels[channel];
      // console.log('handle stats channel data', channel_data)
      Object.keys(channel_data.nodes.health).forEach(function (node_id) {
        record = channel_data.nodes.health[node_id];
        received_at = moment(record.Time);
        if (reports[node_id]) {
          old_received_at = moment(reports[node_id].Time);
          if (received_at > old_received_at) {
            // this is newer - use this instead
            reports[node_id] = record;
          }
        } else {
          // new node id - use this report
          reports[node_id] = record;
        }
      });
      n = 0;
      let beeps, node_beeps, telemetry_beeps, blu_beeps;
      Object.keys(channel_data.beeps).forEach(function (tag_id) {
        n += channel_data.beeps[tag_id];
      });
      beeps = n;
      n = 0;
      Object.keys(channel_data.nodes.beeps).forEach(function (tag_id) {
        n += channel_data.nodes.beeps[tag_id];
      });
      node_beeps = n;
      n = 0;
      Object.keys(channel_data.telemetry).forEach(function (tag_id) {
        n += channel_data.telemetry[tag_id];
      });
      telemetry_beeps = n;

      // n = 0;
      // console.log('handle stats blu beeps port', stats.blu_ports)
      // Object.keys(stats.blu_ports).forEach((port) => {
      //   console.log('handle stats blu beeps port', port, stats.blu_ports[port])

      //   Object.keys(stats.blu_ports[port].channels).forEach((channel) => {
      //     console.log('handle stats blu beeps channel', channel)
      //     Object.keys(stats.blu_ports[port].channels[channel].blu_beeps).forEach((tag_id) => {
      //       console.log('handle stats blu beeps tag id', tag_id)
      //       // n += stats.blu_ports[port].channels[channel].blu_beeps[tag_id]
      //       n += stats.blu_ports[port].channels[channel].blu_beeps[tag_id]
      //       console.log('handle stats blu beeps n', n)
      //       blu_stats[port].channels[channel] = {
      //         blu_beeps: n
      //       }
      //       console.log('handle stats blu beeps final', blu_stats)
      //     })
      //   })
      // })

      // blu_beeps = n;
      channel_stats[channel] = {
        beeps: beeps,
        node_beeps: node_beeps,
        telemetry_beeps: telemetry_beeps,
        // blu_beeps: blu_beeps,
        // blu_dropped: blu_dropped,
      };

    });
  };
  nodes = reports;
  // console.log('handle stats channel stats', channel_stats)

  render_nodes(reports);
  render_channel_stats(channel_stats);
  // render_blu_stats(channel_stats);
};

const build_blu_stats = function (port, channel) {
  // console.log('build blu stats object', blu_stats)
  if (Object.keys(blu_stats).includes(port)) {
    // console.log('build blu stats existing port', blu_stats, 'port', port)
    // if port exists within blu stats object, add blu_dropped to existing value
    if (Object.keys(blu_stats[port].channels).includes(channel)) {
      // if channel exists within blu stats object, add blu_dropped to existing value
      // console.log('build blu stats existing channel', blu_stats, 'port', port, 'channel', channel)
    } else {
      // if channel does not exist, channel is added to object and its value is blu_dropped
      blu_stats[port].channels[channel] = { blu_beeps: 0, blu_dropped: 0, }
      // console.log('build blu stats adding new channel to object', blu_stats, 'port', port, 'channel', channel)
      // blu_stats[port].channels[channel].blu_dropped = d
    }
  } else { // blu_stats port conditional

    // add empty port and channels objects to blu_stats object
    blu_stats[port] = { channels: {} }

    // blu_stats = {
    //   [port]: {
    //     channels: {
    //       [channel]: {
    //         blu_beeps: 0,
    //         blu_dropped: 0,
    //       },
    //     },
    //   },
    // }

    // console.log('build blu stats adding port to object', blu_stats)
  } // blu_stats end conditional
}

const handle_blu_stats = function (data) {
  // console.log('handle blu stats incoming data', data)
  // console.log('handle blu stats object before manipulation', blu_stats)

  let port_key = data.port.toString()
  let channel_key = data.channel.toString()
  let blu_beeps = data.blu_beeps
  // console.log('handle blu stats variables for addition', blu_beeps, blu_stats[port_key].channels[channel_key].blu_beeps)
  blu_stats[port_key].channels[channel_key].blu_beeps += blu_beeps
  // console.log('handle blu stats after addition', blu_stats)
  render_blu_stats(blu_stats)

}

const handle_blu_dropped = function (data) {
  // console.log('handle blu dropped data', data)
  let port_key = data.port.toString()
  let channel_key = data.channel.toString()
  // let blu_beeps = 0
  let dropped = data.blu_dropped ?? 0
  // console.log('handle blu dropped, dropped beeps', dropped)

  blu_stats[port_key].channels[channel_key].blu_dropped += dropped

  // console.log('handle blu dropped blu stats after functions', blu_stats)

  render_dropped_detections(blu_stats);

}

const handle_poll = function (data) {
  // console.log('handle poll', data)
  poll_interval = data.poll_interval
  // console.log('handle poll after button click', poll_interval)
  render_poll_interval(data)
}

const render_poll_interval = function (data) {
  // const { channel, poll_interval } = data
  poll_interval = data.poll_interval
  let poll_interval_info = `#poll_interval_${data.port}-${data.channel}`
  // console.log('render poll interval', poll_interval_info)
  document.querySelector(poll_interval_info).textContent = poll_interval;
}

const render_channel_stats = function (channel_stats) {
  // console.log('render channel stats1', channel_stats)
  let beep_info, node_beep_info, telemetry_beep_info;
  //blu_beep_info;
  Object.keys(channel_stats).forEach(function (channel) {
    beep_info = `#beep_count_${channel}`;
    node_beep_info = `#node_beep_count_${channel}`;
    telemetry_beep_info = `#telemetry_beep_count_${channel}`;
    let stats = channel_stats[channel];
    // console.log('render channel stats2', stats)
    document.querySelector(beep_info).textContent = stats.beeps;
    document.querySelector(node_beep_info).textContent = stats.node_beeps;
    document.querySelector(telemetry_beep_info).textContent = stats.telemetry_beeps;
  });
};

const render_blu_stats = function (blu_stats) {
  if (blu_stats) {
    // console.log('render blu stats channel stats', blu_stats)
    let blu_beep_info, blu_node_beep_info, blu_telemetry_beep_info;
    Object.keys(blu_stats).forEach((port) => {
      // console.log('render blu stats port', port)
      Object.keys(blu_stats[port].channels).forEach((channel) => {
        if (channel > 0) {
          blu_beep_info = `#blu_beep_count_${port}-${channel}`
          let stats = blu_stats[Number(port)].channels[Number(channel)].blu_beeps;
          // console.log('blu stats', blu_beep_info, stats)
          // if (stats.blu_beeps) {
          document.querySelector(blu_beep_info).textContent = stats
          // }
        }
      })
    })
    // Object.keys(channel_stats).forEach(function (channel) {
    //   blu_beep_info = `#blu_beep_count_${channel}`;
    //   // blu_node_beep_info = `#blu_node_beep_count_${channel}`;
    //   // blu_telemetry_beep_info = `#blu_telemetry_beep_count_${channel}`;
    //   let stats = channel_stats[channel];
    //   console.log('blu stats', blu_beep_info, stats)
    //   if (stats.blu_beeps) {
    //     document.querySelector(blu_beep_info).textContent = stats.blu_beeps
    //     // document.querySelector(blu_node_beep_info).textContent = stats.node_beeps;
    //     // document.querySelector(blu_telemetry_beep_info).textContent = stats.telemetry_beeps;
    //   };
    // });
  }
};


const render_dropped_detections = function (blu_stats) {
  // console.log('render dropped detections blu stats', blu_stats)
  let blu_stat_info;

  Object.keys(blu_stats).forEach((port) => {
    // console.log('render dropped detections port', port)
    Object.keys(blu_stats[port].channels).forEach((channel) => {
      // console.log('render dropped detections channel', channel)
      if (channel > 0) {

        blu_stat_info = `#blu_dropped_count_${port}-${channel}`;
        // console.log('render dropped detections port and channel', port, channel)

        let stats_blu = blu_stats[Number(port)].channels[Number(channel)].blu_dropped;
        // console.log('render dropped detections', stats_blu)
        document.querySelector(blu_stat_info).textContent = stats_blu;
      }
    })
  })
}

const render_nodes = function (reports) {
  let NODE_TABLE = document.querySelector('#node-history');
  while (NODE_TABLE.firstChild.nextSibling) {
    NODE_TABLE.removeChild(NODE_TABLE.firstChild.nextSibling);
  }
  let report;
  let tr, td;
  Object.keys(reports).forEach(function (node_id, i) {
    report = reports[node_id];
    tr = document.createElement('tr');
    tr.appendChild(createElement(i + 1));
    tr.appendChild(createElement(node_id));
    tr.appendChild(createElement(moment(report.Time).format(DATE_FMT)));
    tr.appendChild(createElement(report.NodeRSSI));
    tr.appendChild(createElement(report.Battery));
    tr.appendChild(createElement(report.Firmware));
    tr.appendChild(createElement(report.Latitude));
    tr.appendChild(createElement(report.Longitude));
    tr.appendChild(createElement(moment(report.RecordedAt).format(DATE_FMT)));
    NODE_TABLE.appendChild(tr);
  });
};

const render_pie = function (id, data) {
  $(id).highcharts({
    chart: {
      type: 'pie'
    },
    plotOptions: {
      pie: {
        dataLabels: {
          enabled: false
        }
      }
    },
    title: {
      text: ''
    },
    credits: {
      enabled: false
    },
    series: data
  });
};

const render_mem_chart = function (free, used) {
  let data = [{
    name: 'Memory Usage',
    data: [{
      name: 'Free',
      y: free
    }, {
      name: 'Used',
      y: used
    }]
  }];
  render_pie('#mem-chart', data);
};

const render_cpu_chart = function (load_avg) {
  let data = [{
    name: '15 Minute CPU Load Average',
    data: [{
      name: 'Used',
      y: load_avg * 100,
    }, {
      name: 'Free CPU',
      y: (1 - load_avg) * 100
    }]
  }];
  render_pie('#cpu-chart', data);
};

const render_tag_hist = function () {
  setInterval(function () {
    let tag_ids = [];
    let sorted_keys = Object.keys(beep_hist).sort(function (a, b) {
      if (a < b) {
        return -1;
      }
      return 1;
    });
    let values = [];
    sorted_keys.forEach(function (tag) {
      let count;
      let alias = localStorage.getItem(tag);
      if (!alias) {
        alias = tag;
      }

      count = beep_hist[tag];
      if (count > 5) {
        tag_ids.push(alias);
        values.push(count);
      }
    });

    $('#tag_hist').highcharts({
      chart: {
        type: 'column'
      },
      title: {
        text: ''
      },
      xAxis: {
        categories: tag_ids,
        crosshair: true
      },
      yAxis: {
        min: 0,
        title: {
          text: 'Count'
        }
      },
      credits: {
        enabled: false
      },
      legend: {
        enabled: false
      },
      series: [{
        name: 'Hist',
        data: values
      }]
    });
  }, 10000);
};

let RAW_LOG;
const updateStats = function () {
  socket.send(JSON.stringify({
    msg_type: 'cmd',
    cmd: 'about'
  }));
  socket.send(JSON.stringify({
    msg_type: 'cmd',
    cmd: 'stats'
  }));
};

const pollRadioFirmware = () => {
  socket.send(JSON.stringify({
    msg_type: 'cmd',
    cmd: 'radio-firmware',
  }));
}

const initialize_websocket = function () {
  let url = 'ws://' + window.location.hostname + ':8001';
  socket = new WebSocket(url);
  socket.addEventListener('close', (event) => {
    alert('Station connection disconnected - you will need to restart your browser once the radio software has restarted');
  });
  socket.addEventListener('open', (event) => {
    console.log('open event', event)
    updateStats();
    setInterval(updateStats, 15000);
    pollRadioFirmware();
  });
  socket.onopen = function (event) {
    console.log('hello connection established')
  }
  socket.onmessage = function (msg) {
    // console.log('message', msg);
    let data = JSON.parse(msg.data);
    // console.log('data', data)
    let tr, td;
    switch (data.msg_type) {
      case ('beep'):
        handle_beep(data);
        break;
      case ('blu'):
        // console.log('blu tag')
        handle_beep(data);
        poll_interval = data.poll_interval
        // console.log('poll interval', poll_interval)
        handle_poll(data);
        // handle_ble(data);
        break;
      case ('blu_stats'):
        // console.log('blu stats event', data)
        handle_blu_stats(data);
      case ('blu_dropped'):
        // console.log('blu dropped event', data)
        handle_blu_dropped(data);
        break;
      case ('poll_interval'):
        // console.log('blu radio poll interval', data)
        handle_poll(data)
        break;
      case ('unlink_port'):
        // console.log('unlink port', data)
        unlink_port = data.port
        break;
      case ('stats'):
        // console.log('handle stats data', data)
        handle_stats(data);
        // handle_blu_stats(data.blu_ports)
        break;
      case ('about'):
        let about = data;
        document.querySelector('#station-id').textContent = about.station_id;
        document.querySelector('#station-image').textContent = about.station_image;
        document.querySelector('#software-start').textContent = moment(about.begin).format(DATE_FMT);
        document.querySelector('#software-update').textContent = moment(about.station_software);
        document.querySelector('#serial').textContent = about.serial;
        document.querySelector('#hardware').textContent = about.hardware;
        document.querySelector('#revision').textContent = about.revision;
        document.querySelector('#bootcount').textContent = about.bootcount;
        let total = Math.round(about.total_mem / 1024 / 1024.0);
        let free = Math.round(about.free_mem / 1024 / 1024.0);
        let used = total - free;
        render_mem_chart(free, used);
        render_cpu_chart(about.loadavg_15min);
        setText('memory', used + ' MB of ' + total + ' MB used');
        setText('uptime', moment(new Date()).subtract(about.uptime, 's'));
        break;
      case ('log'):
        tr = document.createElement('tr');
        td = document.createElement('td');
        td.textContent = moment(new Date()).utc().format(DATE_FMT);
        tr.appendChild(td);
        td = document.createElement('td');
        td.textContent = data.data;
        tr.appendChild(td);
        RAW_LOG.insertBefore(tr, RAW_LOG.firstChild.nextSibling);
        break;
      case ('node-alive'):
        break;
      case ('gps'):
        setText('lat', data.gps.lat.toFixed(6));
        setText('lng', data.gps.lon.toFixed(6));
        setText('time', moment(new Date(data.gps.time)));
        setText('alt', data.gps.alt);
        let n = 0;
        data.sky.satellites.forEach((sat) => {
          if (sat.used == true) n += 1;
        });
        setText('nsats', `${n} of ${data.sky.satellites.length} used`);
        break;
      case ('fw'):
        document.querySelector('#raw_log').value += data.data
        break
      case ('radio-firmware'):
        // console.log('setting radio firwmare', data)
        Object.keys(data.firmware).forEach((channel) => {
          const firmware = data.firmware[channel]
          document.querySelector(`#radio-firmware-version-${channel}`).textContent = firmware
        })
        break
      case ('blu-firmware'):
        // console.log('setting blu firmware', data)
        Object.keys(data.firmware).forEach((port) => {
          // console.log('blu firmware port', port)

          Object.keys(data.firmware[port].channels).forEach((channel) => {
            const firmware = data.firmware[port].channels[channel]
            document.querySelector(`#blu-firmware-version-${port}-${channel}`).textContent = firmware
          })
        })
        break
      default:
        console.log('WTF dunno', data);

      //      document.querySelector('#raw_gps').textContent = JSON.stringify(data, null, 2);
    }
  };
};

const updateChrony = function () {
  $.ajax({
    url: '/chrony',
    method: 'get',
    success: function (data) {
      document.querySelector('#chrony').textContent = data;
    },
    error: function (err) {
      console.error(err);
    }
  });
};

const get_config = function () {
  $.ajax({
    url: '/config',
    success: function (contents) {
      let i = 0;
      let radio_id, value;
      contents.radios.forEach(function (radio) {
        // console.log('radio', radio)
        i++;
        radio_id = "#config_radio_" + i;
        switch (radio.config[0]) {
          case "preset:node3":
            value = "Node";
            break;
          case "preset:fsktag":
            value = "Tag";
            break;
          case "preset:ooktag":
            value = "Original Tag"
            break;
          default:
            value = "Custom Mode"
            break;
        }
        document.querySelector(radio_id).textContent = value;
      });

    }
  })
};

const build_row = function (opts) {
  let tr = document.createElement('tr')
  let th = document.createElement('th')
  let td = document.createElement('td')
  th.textContent = opts.header
  span = document.createElement('span')
  span.setAttribute('id', opts.id)
  td.appendChild(span)
  tr.appendChild(th)
  tr.appendChild(td)
  return tr
};

const build_radio_component = function (n) {
  let wrapper = document.createElement('div')

  let h2 = document.createElement('h2')
  h2.setAttribute('style', 'text-align: center;')
  h2.textContent = 'Radio ' + n
  wrapper.appendChild(h2)
  const version_label = document.createElement('span')
  version_label.textContent = 'version:'
  const firmware_version = document.createElement('span')
  firmware_version.setAttribute('id', `radio-firmware-version-${n}`)
  const firmware = document.createElement('div')
  firmware.appendChild(version_label)
  firmware.appendChild(firmware_version)
  wrapper.appendChild(firmware)
  let h5 = document.createElement('h5')
  let span = document.createElement('span')
  span.setAttribute('style', 'padding-right:5px;')
  span.textContent = 'Current Mode:'
  h5.appendChild(span)
  span = document.createElement('span')
  span.setAttribute('id', `config_radio_${n}`)
  h5.appendChild(span)
  wrapper.appendChild(h5)
  let table = document.createElement('table')
  table.setAttribute('class', 'table table-sm table-bordered table-dark')
  table.setAttribute('id', `radio_stats_${n}`)
  let row = build_row({ n: n, header: 'Beeps', id: `beep_count_${n}` })
  table.appendChild(row)
  row = build_row({ n: n, header: 'Nodes', id: `node_beep_count_${n}` })
  table.appendChild(row)
  row = build_row({ n: n, header: 'Telemetry', id: `telemetry_beep_count_${n}` })
  table.appendChild(row)
  wrapper.appendChild(table)
  let div = document.createElement('div')
  div.setAttribute('style', 'overflow:scroll; height:400px;')
  table = document.createElement('table')
  table.setAttribute('class', 'table table-sm table-bordered table-dark radio')
  table.setAttribute('id', `radio_${n}`)
  tr = document.createElement('tr')
  tr.setAttribute('class', 'table-primary')
  tr.setAttribute('style', 'color:#111;')
  th = document.createElement('th')
  th.textContent = 'Time'
  tr.appendChild(th)
  th = document.createElement('th')
  th.textContent = 'Tag ID'
  tr.appendChild(th)
  th = document.createElement('th')
  th.textContent = 'RSSI'
  tr.appendChild(th)
  th = document.createElement('th')
  th.textContent = 'Node'
  tr.appendChild(th)
  table.appendChild(tr)
  div.appendChild(table)
  wrapper.appendChild(div)

  div = document.createElement('div')
  div.setAttribute('class', 'row')

  let col_sm = document.createElement('div')
  col_sm.setAttribute('class', 'col-sm')
  let button = document.createElement('button')
  button.setAttribute('class', 'btn btn-block btn-sm btn-danger')
  button.setAttribute('name', 'toggle_node_radio')
  button.setAttribute('value', n)
  button.textContent = 'Node'
  col_sm.appendChild(button)
  div.appendChild(col_sm)

  col_sm = document.createElement('div')
  col_sm.setAttribute('class', 'col-sm')
  button = document.createElement('button')
  button.setAttribute('class', 'btn btn-block btn-sm btn-danger')
  button.setAttribute('name', 'toggle_tag_radio')
  button.setAttribute('value', n)
  button.textContent = 'Tag'
  col_sm.appendChild(button)
  div.appendChild(col_sm)

  col_sm = document.createElement('div')
  col_sm.setAttribute('class', 'col-sm')
  button = document.createElement('button')
  button.setAttribute('class', 'btn btn-block btn-sm btn-danger')
  button.setAttribute('name', 'toggle_ook_radio')
  button.setAttribute('value', n)
  button.textContent = 'OOK'
  col_sm.appendChild(button)
  div.appendChild(col_sm)
  wrapper.appendChild(div)

  return wrapper
};

const build_blu_receiver = function (port) {
  let wrapper = document.createElement('div')
  wrapper.setAttribute('style', 'display:none')

  wrapper.setAttribute('class', 'container')
  wrapper.setAttribute('id', `blu-receiver-${port}`)
  // let div = document.createElement('div')
  // div.setAttribute('class', `blu-receiver-switch-${port}`)
  // div.setAttribute('id', `blu-receiver-switch-${port}`)
  // let input = document.createElement('input')
  // input.setAttribute('class', 'form-check-input')
  // input.setAttribute('type', 'checkbox')
  // input.setAttribute('role', 'switch')
  // input.setAttribute('id', `blu-receiver-switch-${port}-input`)
  // // input.setAttribute('')
  // let label = document.createElement('label')
  // label.setAttribute('class', 'form-check-label')
  // label.setAttribute('style', 'top:1.2rem; width:1.85rem; height:1.85rem;')
  // label.setAttribute('for', `blu-receiver-switch-${port}-input`)
  // div.appendChild(input)
  // div.appendChild(label)
  let h2 = document.createElement('h2')
  h2.setAttribute('style', 'text-align: center; color: #007FFF')
  h2.setAttribute('id', `blu-port-${port}`)
  // wrapper.appendChild(div)

  // h2.setAttribute('style', 'display:none')

  h2.textContent = `Bl${umacr} Receiver on USB Port ` + port
  wrapper.appendChild(h2)

  return wrapper
}

const build_blu_component = function (port, radio) {
  let wrapper = document.createElement('div')
  wrapper.setAttribute('id', `blu-radio-${port}-${radio}`)
  let h2 = document.createElement('h2')
  h2.setAttribute('style', 'text-align: center; color: #007FFF')
  h2.textContent = `Bl${umacr} Radio ` + radio
  wrapper.appendChild(h2)
  const version_label = document.createElement('span')
  version_label.textContent = 'version: '
  const firmware_version = document.createElement('span')
  firmware_version.setAttribute('id', `blu-firmware-version-${port}-${radio}`)
  const firmware = document.createElement('div')
  firmware.appendChild(version_label)
  firmware.appendChild(firmware_version)
  wrapper.appendChild(firmware)
  let h5 = document.createElement('h5')
  let span = document.createElement('span')
  // span.setAttribute('style', 'padding-right:5px;')
  // span.textContent = 'Current Mode:'
  // h5.appendChild(span)
  span = document.createElement('span')
  span.setAttribute('id', `config_radio_${port}`)
  h5.appendChild(span)
  wrapper.appendChild(h5)
  let table = document.createElement('table')
  table.setAttribute('class', 'table table-sm table-bordered table-dark')
  table.setAttribute('id', `radio_stats_${port}-${radio}`)
  let row = build_row({ n: radio, header: 'Beeps', id: `blu_beep_count_${port}-${radio}` })
  table.appendChild(row)
  row = build_row({ n: radio, header: 'Dropped Detections', id: `blu_dropped_count_${port}-${radio}` })
  table.appendChild(row)
  // row = build_row({ n: n, header: 'Nodes', id: `blu_node_beep_count_${n}` })
  // table.appendChild(row)
  // row = build_row({ n: n, header: 'Telemetry', id: `blu_telemetry_beep_count_${n}` })
  // table.appendChild(row)
  row = build_row({ header: 'Poll Interval (ms)', id: `poll_interval_${port}-${radio}` })
  table.appendChild(row)
  wrapper.appendChild(table)
  let div = document.createElement('div')
  div.setAttribute('style', 'overflow:scroll; height:400px;')
  table = document.createElement('table')
  table.setAttribute('class', 'table table-sm table-bordered table-dark radio')
  table.setAttribute('id', `blu-radio_${port}-${radio}`)
  tr = document.createElement('tr')
  tr.setAttribute('class', 'table-primary')
  tr.setAttribute('style', 'color:#111;')
  th = document.createElement('th')
  th.textContent = 'Time'
  tr.appendChild(th)
  th = document.createElement('th')
  th.textContent = 'Tag ID'
  tr.appendChild(th)
  th = document.createElement('th')
  th.textContent = 'RSSI'
  tr.appendChild(th)
  th = document.createElement('th')
  th.textContent = 'Node'
  tr.appendChild(th)
  table.appendChild(tr)
  div.appendChild(table)
  wrapper.appendChild(div)

  // div = document.createElement('div')
  // div.setAttribute('class', 'row')

  return wrapper
}

const build_blu_buttons = function (port) {
  let div = document.createElement('div')
  div.setAttribute('class', 'row')
  col_sm = document.createElement('div')
  col_sm.setAttribute('class', 'col-sm')
  button = document.createElement('button')
  button.setAttribute('class', 'btn btn-block btn-sm btn-info')
  button.setAttribute('name', 'toggle_radio_on')
  button.setAttribute('value', port)
  button.textContent = 'Radios On'
  col_sm.appendChild(button)
  div.appendChild(col_sm)
  document.querySelector(`#blu-receiver-${port}-row`).appendChild(div)

  col_sm = document.createElement('div')
  col_sm.setAttribute('class', 'col-sm')
  button = document.createElement('button')
  button.setAttribute('class', 'btn btn-block btn-sm btn-info')
  button.setAttribute('name', 'toggle_radio_off')
  button.setAttribute('value', port)
  button.textContent = 'Radios Off'
  col_sm.appendChild(button)
  div.appendChild(col_sm)
  document.querySelector(`#blu-receiver-${port}-row`).appendChild(div)

  col_sm = document.createElement('div')
  col_sm.setAttribute('class', 'col-sm')
  button = document.createElement('button')
  button.setAttribute('class', 'btn btn-block btn-sm btn-info')
  button.setAttribute('name', 'toggle_radio_led_on')
  button.setAttribute('value', port)
  button.textContent = 'Radio LED On'
  col_sm.appendChild(button)
  div.appendChild(col_sm)
  document.querySelector(`#blu-receiver-${port}-row`).appendChild(div)

  col_sm = document.createElement('div')
  col_sm.setAttribute('class', 'col-sm')
  button = document.createElement('button')
  button.setAttribute('class', 'btn btn-block btn-sm btn-info')
  button.setAttribute('name', 'toggle_radio_led_off')
  button.setAttribute('value', port)
  button.textContent = 'Radio LED Off'
  col_sm.appendChild(button)
  div.appendChild(col_sm)
  document.querySelector(`#blu-receiver-${port}-row`).appendChild(div)

  col_sm = document.createElement('div')
  col_sm.setAttribute('class', 'col-sm')
  button = document.createElement('button')
  button.setAttribute('class', 'btn btn-block btn-sm btn-info')
  button.setAttribute('name', 'reboot_blu_radio')
  button.setAttribute('value', port)
  button.textContent = 'Reboot Radio'
  col_sm.appendChild(button)
  div.appendChild(col_sm)
  document.querySelector(`#blu-receiver-${port}-row`).appendChild(div)

  col_sm = document.createElement('div')
  col_sm.setAttribute('class', 'col-sm')
  button = document.createElement('button')
  button.setAttribute('class', 'btn btn-block btn-sm btn-info')
  button.setAttribute('name', 'radio_polling')
  button.setAttribute('value', port)
  button.textContent = `Change Polling Interval`
  col_sm.appendChild(button)
  div.appendChild(col_sm)
  document.querySelector(`#blu-receiver-${port}-row`).appendChild(div)

  col_sm = document.createElement('div')
  col_sm.setAttribute('class', 'col-sm')
  button = document.createElement('button')
  button.setAttribute('class', 'btn btn-block btn-sm btn-info')
  button.setAttribute('name', 'update_blu_firmware')
  button.setAttribute('value', port)
  button.textContent = `Update Bl${umacr} Radio Firmware`
  col_sm.appendChild(button)
  div.appendChild(col_sm)
  document.querySelector(`#blu-receiver-${port}-row`).appendChild(div)

}

const build_version_element = function (opts) {
  let tr = document.createElement('tr')
  let th = document.createElement('th')
  th.textContent = opts.name
  tr.appendChild(th)
  let td = document.createElement('td')
  td.textContent = opts.version
  tr.appendChild(td)
  return tr
}

const initialize_software_versions = function () {
  fetch('/software')
    .then(res => res.json())
    .then((json) => {
      let table = document.querySelector('#meta')
      let tr
      if (json.packages) {
        json.packages.forEach((version) => {
          tr = build_version_element({
            name: version.name,
            version: version.version
          })
          table.appendChild(tr)
        })
      }
      if (json.version) {
        tr = build_version_element({
          name: 'System',
          version: json.version
        })
        table.appendChild(tr)
      }
    })
    .catch((err) => {
      console.error('error getting software version')
      console.error(err)
    })
};

const render_gateway = function () {
  fetch('/internet-gateway')
    .then(function (res) { return res.json() })
    .then(function (json) {
      document.querySelector('#internet-gateway').textContent = json.gateway
    })
    .catch(function (err) {
      console.error('error rendering gateway')
      console.error(err)
    })
}

const initialize_reboot = function () {
  let dom_select = document.querySelector('#reboot-dom')
  let values = [{
    value: '*',
    name: 'Any Day Of Month'
  }]
  for (let i = 1; i < 32; i++) {
    values.push({
      value: i,
      name: i.toString()
    })
  }
  values.forEach(function (value) {
    let opt = document.createElement('option')
    opt.setAttribute('value', value.value)
    opt.textContent = value.name
    dom_select.appendChild(opt)
  })

  document.querySelector('#reboot-hour').addEventListener('change', function (e) {
    if (e.target.value > 23) {
      e.target.value = 23
    }
    if (e.target.value < 0) {
      e.target.value = 0
    }
  })

  document.querySelector('#reboot-minute').addEventListener('change', function (e) {
    if (e.target.value > 59) {
      e.target.value = 59
    }
    if (e.target.value < 0) {
      e.target.value = 0
    }
  })

  document.querySelector('#update-reboot-schedule').addEventListener('click', function (e) {
    e.target.setAttribute('disabled', true)
    let body = {
      hour: document.querySelector('#reboot-hour').value,
      minute: document.querySelector('#reboot-minute').value,
      dom: document.querySelector('#reboot-dom').value,
      mon: '*',
      dow: document.querySelector('#reboot-dow').value
    }
    fetch('/update-reboot-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (res.ok) {
          alert('Reboot schedule successfully updated')
          e.target.removeAttribute('disabled')
        } else {
          console.log(res)
          console.error('invalid response', res.status)
        }
      })
  })

  fetch('/reboot-schedule')
    .then(function (req) { return req.json() })
    .then(function (json) {
      document.querySelector('#reboot-hour').value = json.h
      document.querySelector('#reboot-minute').value = json.m
      document.querySelector('#reboot-dow').value = json.dow
      document.querySelector('#reboot-dom').value = json.dom
    })
}

const build_sg_tag_file_upload = function () {

}

const init_sg = () => {
  document.querySelector('#upload-sensorgnome-tag-db').addEventListener('click', (evt) => {
    let tag_file = document.querySelector('#tag-db-file').files[0]
    console.log('uploading tag file', tag_file.name)
    const file_ext = tag_file.name.split('.').pop()
    const valid_exts = ['csv', 'sqlite']
    if (!valid_exts.includes(file_ext.toLowerCase())) {
      // invalid file extenstion - expected csv or sqlite
      alert('invalid file selected - expected csv or sqlite file')
      return
    }
    const reader = new FileReader()
    reader.readAsArrayBuffer(tag_file)
    reader.onload = (e) => {
      let contents = e.target.result
      console.log('loaded file contents', contents.length)
      fetch('/upload-sg-tag-file', {
        method: 'POST',
        body: contents,
        headers: {
          'Content-Type': 'application/octet-stream',
          'file-extension': file_ext
        }
      }).then(res => res.json())
        .then(json => {
          if (json.res == true) {
            alert('Tag database upload complete')
          } else {
            alert('invalid response for tag database upload')
          }
        }).catch((err) => {
          console.error(err)
          alert('An error occured attempting to upload the SG tag file database')
        })
    }
  })
}

  ; (function () {

    window.onload = function () {
      document.getElementById('tag-filter-input').value = '';
      console.log('tag filter reset value', document.getElementById('tag-filter-input').value = '')
    }

    document.querySelector('#sg_link').setAttribute('href', 'http://' + window.location.hostname + ':3010');
    render_gateway()
    initialize_reboot()
    setInterval(render_gateway, 5000)
    let blu_receiver, blu_radio, component, col, row
    let max_row_count = localStorage.getItem('max-row-count')
    if (max_row_count) {
      MAX_ROW_COUNT = max_row_count
    } else {
      localStorage.setItem('max-row-count', MAX_ROW_COUNT)
    }
    initialize_software_versions()
    for (let i = 1; i <= 5; i++) {
      component = build_radio_component(i)
      col = document.createElement('div')
      col.classList.add('col-lg')
      col.appendChild(component)
      document.querySelector('#main-radios').appendChild(col)
    }
    for (let i = 6; i <= 12; i++) {
      component = build_radio_component(i)
      col = document.createElement('div')
      col.classList.add('col-lg')
      col.appendChild(component)
      document.querySelector('#extra-radios').appendChild(col)
    }

    for (let i = 1; i <= 6; i++) {
      blu_receiver = build_blu_receiver(i)
      row = document.createElement('div')
      row.classList.add('row')
      row.setAttribute('id', `blu-receiver-${i}-row`)
      // row.appendChild(component)
      blu_receiver.appendChild(row)
      document.querySelector('#blu-receiver').appendChild(blu_receiver)

      // document.querySelector('#blu-receiver').appendChild(row)
      // document.querySelector(`#blu-port-${i}`).appendChild(row)


      for (let j = 1; j <= 4; j++) {
        blu_radio = build_blu_component(i, j)
        blu_radio.setAttribute('id', `blu-radio-${i}-${j}`)

        // .appendChild(document.createElement('div').classList.add('col-lg'))
        // .appendChild(document.querySelector('#blu-radios').appendChild())
        col = document.createElement('div')
        col.classList.add('col-lg')
        col.setAttribute('id', `blu-column-${i}-${j}`)
        col.appendChild(blu_radio)
        document.querySelector(`#blu-receiver-${i}-row`).append(col)
        // blu_radio.appendChild(col)
        // document.querySelector('#blu-radios').appendChild(col)
        // document.querySelector('#blu-receiver').appendChild(col)
        // blu_receiver.appendChild(col)


      }

      build_blu_buttons(i)
    }

    initialize_websocket();
    initialize_controls();
    initialize_blu_controls();
    get_config();
    render_tag_hist();
    RAW_LOG = document.querySelector('#raw_log');
    updateChrony();
    setInterval(updateChrony, 30000);
    init_sg()
    $.ajax({
      url: '/sg-deployment',
      success: function (contents) {
        document.querySelector('#sg-deployment').value = contents;
      }
    });
  })();