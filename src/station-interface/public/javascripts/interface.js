let beeps = [];
let tags = new Set();
let nodes = {};
let beep_hist = {};
let beep_channels = [];
let blu_stats = {};
let blu_ports = []
let dongle_radios = []
let unlink_dongle
let poll_interval;
let filter
let umacr = '\u016B';


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
  document.querySelector('#enable-wifi').addEventListener('click', async (e) => {
    let res = window.confirm('Are you sure you want to enable wifi?');
    if (res) {
      const response = await fetch('/wifi/enable', { method: 'POST' })
      if (response.ok) {
        alert('Wifi has been enabled')
      } else {
        alert('Something went wrong enabling wifi')
      }
    }
  })
  document.querySelector('#disable-wifi').addEventListener('click', async (e) => {
    let res = window.confirm('Are you sure you want to disable wifi?');
    if (res) {
      const response = await fetch('/wifi/disable', { method: 'POST' })
      if (response.ok) {
        alert('Wifi has been disabled')
      } else {
        alert('Something went wrong disabling wifi')
      }
    }
  })

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
  document.querySelector('#enable-modem').addEventListener('click', async function (e) {
    let res = window.confirm('Are you sure you want to enable the modem?');
    if (res) {
      const response = await fetch('/modem/enable', { method: 'POST' })
      if (response.ok) {
        alert('Modem has been enabled')
      } else {
        alert('Something went wrong enabling the modem')
      }
    }
  });
  document.querySelector('#disable-modem').addEventListener('click', async function (e) {
    let res = window.confirm('WARNING: Are you sure you want to PERMANENTLY diable the modem?');
    if (res) {
      const response = await fetch('/modem/disable', { method: 'POST' })
      if (response.ok) {
        alert('Modem has been disabled')
      } else {
        alert('Something went wrong disabling the modem')
      }
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

  document.querySelectorAll('#mainRadiosSwitch').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (document.querySelector('#main-radios').style.display !== 'none') {
        document.querySelector('#main-radios').style.display = 'none'

      } else {
        document.querySelector('#main-radios').style.display = ''

      }
    })
  })

  document.querySelectorAll('#dongleRadioSwitch').forEach((btn) => {
    btn.addEventListener('click', (e) => {

      if (document.querySelector('#dongles').style.display !== 'none') {
        document.querySelector('#dongles').style.display = 'none'

      } else {
        document.querySelector('#dongles').style.display = ''

      }
      // }
    })
  })

  let tag_filter = document.getElementById("tag-filter")

  tag_filter.addEventListener('input', (e) => {
    let input, table, tr, td, i, txtValue
    input = document.getElementById('tag-filter-input')
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // e.stopPropagation()
        e.preventDefault()
      }
    }, false)

    filter = input.value.toUpperCase()

    Object.values(document.getElementsByClassName('table table-sm table-bordered table-dark radio')).forEach((table) => {

      tr = table.getElementsByTagName('tr')

      for (i = 0; i < tr.length; i++) {
        td = tr[i].getElementsByTagName('td')[1]
        if (td) {
          txtValue = td.textContent || td.innterText

          if (txtValue.toUpperCase().indexOf(filter) > -1) {
            tr[i].style.display = ""
          } else {
            tr[i].style.display = "none"
          }
        }
      }
    }) //end of get tables forEach loop
  })
};


const format_beep = function (beep) {
  if (beep.data) {
    let tag_id, rssi, node_id, tag_at, blu_channel, data_type, port, vcc, temp, poll_interval;
    let beep_at = moment(new Date(beep.received_at)).utc();
    tag_at = beep_at;
    if (beep.protocol) {
      if (beep.meta.data_type == 'blu_tag') {
        blu_channel = beep.channel;
        poll_interval = beep.poll_interval;
        tag_id = beep.id;
        rssi = beep.rssi;
        tag_at = beep_at;
        data_type = beep.meta.data_type
        port = beep.port
        vcc = beep.vcc
        temp = beep.temp
      }
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

    if (beep.data.tag) {
      tag_id = beep.data.tag.id;
      rssi = beep.rssi;
    }

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
      poll_interval: poll_interval ?? null,
      received_at: beep_at,
      tag_at: tag_at,
      data_type: data_type,
      port: port ?? null,
      vcc: vcc ?? null,
      temp: temp ?? null,
    }

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

let DONGLES_ENABLED = false;
let MAX_ROW_COUNT = 1000;

const handle_blu_beep = function (beep) {
  let tag_id = beep.tag_id.toUpperCase();
  let port = beep.port.toString()
  let channel = beep.channel.toString()

  handle_add_port(beep)
  build_blu_stats(port, channel)

  let BLU_TABLE = document.querySelector('#blu-radio_' + port + '-' + beep.blu_channel);

  let tr = document.createElement('tr');
  tr.style.border = "2px solid #22dd22"; // all blu beeps are validated so green outline
  let td = document.createElement('td');
  td.textContent = beep.tag_at.format(DATE_FMT);
  tr.appendChild(td);
  let alias = localStorage.getItem(tag_id);
  if (alias) {
    tr.appendChild(createElement(alias));
  } else {
    tr.appendChild(createElement(tag_id));
  }

  let regex_filter = filter !== '' ? new RegExp(filter) : new RegExp(undefined)
  if (tag_id == filter || filter === undefined || filter === '' || regex_filter.test(tag_id)) {
    tr.style.display = ""

  } else {
    tr.style.display = "none"
  }

  // individual beeps table data goes here!!!
  tr.appendChild(createElement(beep.rssi));
  tr.appendChild(createElement(beep.node_id));
  tr.appendChild(createElement(beep.vcc))
  tr.appendChild(createElement(beep.temp))

  // remove last beep record if table exceeds max row count
  if (BLU_TABLE.children.length > MAX_ROW_COUNT) {
    BLU_TABLE.removeChild(BLU_TABLE.lastElementChild)
  }
  BLU_TABLE.insertBefore(tr, BLU_TABLE.firstChild.nextSibling);

  let beep_count = beep_hist[tag_id];
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

  if (beep.channel > 5 && dongle_radios.includes(beep.channel)) {
  } else if (beep.channel > 5) {
    dongle_radios.push(beep.channel)
  }

  dongle_radios.forEach((radio) => {
    document.querySelector(`#dongle-radio-${radio}`).style.display = ''
  })

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
  let regex_filter = filter !== '' ? new RegExp(filter) : new RegExp(undefined)
  if (tag_id == filter || filter === undefined || filter === '' || regex_filter.test(tag_id)) {
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
  BEEP_TABLE.insertBefore(tr, BEEP_TABLE.firstChild.nextSibling);
  beeps.push(beep);
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
  let record;
  let reports = {};
  let received_at, old_received_at;
  let n = 0;
  let channel_stats = {}
  if (stats.channels) {

    Object.keys(stats.channels).forEach(function (channel) {
      let channel_data = stats.channels[channel];
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

      channel_stats[channel] = {
        beeps: beeps,
        node_beeps: node_beeps,
        telemetry_beeps: telemetry_beeps,
      };

    });
  };
  nodes = reports;

  render_nodes(reports);
  render_channel_stats(channel_stats);
};

const handle_add_port = function (data) {
  let add_port = data.port.toString()

  if (blu_ports.includes(add_port)) {

  } else {
    blu_ports.push(add_port)
  }

  blu_ports.forEach((port) => {
    document.querySelector(`#blu-receiver-${port}`).style.display = ''
  })
}

const handle_blu_unlink = function (data) {
  let unlink_port = data.port
  document.querySelector(`#blu-receiver-${unlink_port}`).style.display = 'none'
  let unlink_index = blu_ports.findIndex(port => port === unlink_port)
  blu_ports.splice(unlink_index, 1)
}

const handle_dongle_unlink = function (data) {
  let unlink_port = data.port
  document.querySelector(`#dongle-radio-${unlink_port}`).style.display = 'none'
  let unlink_index = dongle_radios.findIndex(port => port === unlink_port)
  dongle_radios.splice(unlink_index, 1)
}

const build_blu_stats = function (port, channel) {
  if (Object.keys(blu_stats).includes(port)) {
    // if port exists within blu stats object, add blu_dropped to existing value
    if (Object.keys(blu_stats[port].channels).includes(channel)) {
      // if channel exists within blu stats object, add blu_dropped to existing value
    } else {
      // if channel does not exist, channel is added to object and its value is blu_dropped
      blu_stats[port].channels[channel] = { blu_beeps: 0, blu_dropped: 0, }
    }
  } else { // blu_stats port conditional

    // add empty port and channels objects to blu_stats object
    blu_stats[port] = { channels: {} }
  }
}

const handle_blu_stats = function (data) {
  let port_key = data.port.toString()
  let channel_key = data.channel.toString()

  let n = 0;

  if (blu_stats[port_key].channels[channel_key]) {
    blu_stats[port_key].channels[channel_key].beeps = data.blu_beeps

    Object.keys(blu_stats[port_key].channels[channel_key].beeps).forEach((tag_id) => {
      n += blu_stats[port_key].channels[channel_key].beeps[tag_id];
    });
    blu_beeps = n;

    blu_stats[port_key].channels[channel_key] = {
      blu_beeps: blu_beeps,
    };

  };
  render_blu_stats(blu_stats)

}

const handle_blu_dropped = function (data) {
  let port_key = data.port.toString()
  let channel_key = data.channel.toString()
  let dropped = data.blu_dropped
  blu_stats[port_key].channels[channel_key].blu_dropped = dropped
  render_dropped_detections(blu_stats);
}

const handle_poll = function (data) {
  poll_interval = data.poll_interval
  render_poll_interval(data)
}

const render_poll_interval = function (data) {
  poll_interval = data.poll_interval
  let poll_interval_info = `#poll_interval_${data.port}-${data.channel}`
  document.querySelector(poll_interval_info).textContent = (Number(poll_interval) / 1000);
}

const render_channel_stats = function (channel_stats) {
  let beep_info, node_beep_info, telemetry_beep_info;
  Object.keys(channel_stats).forEach(function (channel) {
    beep_info = `#beep_count_${channel}`;
    node_beep_info = `#node_beep_count_${channel}`;
    telemetry_beep_info = `#telemetry_beep_count_${channel}`;
    let stats = channel_stats[channel];
    document.querySelector(beep_info).textContent = stats.beeps;
    document.querySelector(node_beep_info).textContent = stats.node_beeps;
    document.querySelector(telemetry_beep_info).textContent = stats.telemetry_beeps;
  });
};

const render_blu_stats = function (blu_stats) {
  if (blu_stats) {
    let blu_beep_info, blu_node_beep_info, blu_telemetry_beep_info;
    Object.keys(blu_stats).forEach((port) => {
      Object.keys(blu_stats[port].channels).forEach((channel) => {
        if (channel > 0) {
          blu_beep_info = `#blu_beep_count_${port}-${channel}`
          let stats = blu_stats[Number(port)].channels[Number(channel)].blu_beeps;
          // document.querySelector(blu_beep_info).textContent = stats > 0 ? stats : 0
          document.querySelector(blu_beep_info).textContent = stats
        }
      })
    })
  }
};


const render_dropped_detections = function (blu_stats) {
  let blu_stat_info;

  Object.keys(blu_stats).forEach((port) => {
    Object.keys(blu_stats[port].channels).forEach((channel) => {
      if (channel > 0) {

        blu_stat_info = `#blu_dropped_count_${port}-${channel}`;

        let stats_blu = blu_stats[Number(port)].channels[Number(channel)].blu_dropped;
        // document.querySelector(blu_stat_info).textContent = stats_blu > 0 ? stats_blu : 0
        document.querySelector(blu_stat_info).textContent = stats_blu

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

const render_modem = function () {
  fetch('/modem-signal-strength')
    .then(function (res) { return res.json() })
    .then(function (json) {
      let signal = json.signal
      let state = json.state

      if (state == "connected") {

        if (signal > 75) {
          document.querySelector('#modem-icon').setAttribute('class', 'bi bi-reception-4')
          document.querySelector('#modem-icon').setAttribute('style', "width:50; height:30; fill:#00d747;")
          document.querySelector('.modem-path0').setAttribute('d', "M0 11.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5z")

        } else if (signal <= 75 && signal > 50) {
          document.querySelector('#modem-icon').setAttribute('class', 'bi bi-reception-3')
          document.querySelector('#modem-icon').setAttribute('style', "width:50; height:30; fill:#00d747;")
          document.querySelector('.modem-path0').setAttribute('d', "M0 11.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm4 8a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5")

        } else if (signal <= 50 && signal > 25) {
          document.querySelector('#modem-icon').setAttribute('class', 'bi bi-reception-2')
          document.querySelector('#modem-icon').setAttribute('style', "width:50; height:30; fill:#ffff00;")
          document.querySelector('.modem-path0').setAttribute('d', "M0 11.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm4 5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m4 0a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5")

        } else if (signal <= 25 && signal > 0) {
          document.querySelector('#modem-icon').setAttribute('class', 'bi bi-recption-1')
          document.querySelector('#modem-icon').setAttribute('style', "width:50; height:30; fill:red;")
          document.querySelector('.modem-path0').setAttribute('d', "M0 11.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm4 2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m4 0a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m4 0a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5")

        } else if (signal == undefined) {
          document.querySelector('#modem-icon').setAttribute('class', 'bi bi-reception-0')
          document.querySelector('#modem-icon').setAttribute('style', "width:50; height:30; fill:red;")
          document.querySelector('.modem-path0').setAttribute('d', "M0 13.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m4 0a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m4 0a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m4 0a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5")
        }
      } else {
        document.querySelector('#modem-icon').setAttribute('class', 'bi bi-reception-0')
        document.querySelector('#modem-icon').setAttribute('style', "width:50; height:30; fill:red;")
        document.querySelector('.modem-path0').setAttribute('d', "M0 13.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m4 0a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m4 0a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m4 0a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5")
      }
    })
    .catch(function (err) {
      console.error('error rendering modem strength', err)
    })

}

const render_wifi = function () {

  fetch('/internet-wifi-strength')
    .then(function (res) { return res.json() })
    .then(function (json) {
      let percent = json.signal
      let state = json.connected
      if (state == true) {


        if (percent > 66) {
          document.querySelector('#wifi-icon').setAttribute('class', 'bi bi-wifi')
          document.querySelector('#wifi-icon').setAttribute('style', "width:50; height:30; fill:#00d747;")
          document.querySelector('.wifi-path0').setAttribute('d', "M15.384 6.115a.485.485 0 0 0-.047-.736A12.44 12.44 0 0 0 8 3C5.259 3 2.723 3.882.663 5.379a.485.485 0 0 0-.048.736.52.52 0 0 0 .668.05A11.45 11.45 0 0 1 8 4c2.507 0 4.827.802 6.716 2.164.205.148.49.13.668-.049")
          document.querySelector('.wifi-path1').setAttribute('d', "M13.229 8.271a.482.482 0 0 0-.063-.745A9.46 9.46 0 0 0 8 6c-1.905 0-3.68.56-5.166 1.526a.48.48 0 0 0-.063.745.525.525 0 0 0 .652.065A8.46 8.46 0 0 1 8 7a8.46 8.46 0 0 1 4.576 1.336c.206.132.48.108.653-.065m-2.183 2.183c.226-.226.185-.605-.1-.75A6.5 6.5 0 0 0 8 9c-1.06 0-2.062.254-2.946.704-.285.145-.326.524-.1.75l.015.015c.16.16.407.19.611.09A5.5 5.5 0 0 1 8 10c.868 0 1.69.201 2.42.56.203.1.45.07.61-.091zM9.06 12.44c.196-.196.198-.52-.04-.66A2 2 0 0 0 8 11.5a2 2 0 0 0-1.02.28c-.238.14-.236.464-.04.66l.706.706a.5.5 0 0 0 .707 0l.707-.707z")

        } else if (percent <= 66 && percent > 33) {

          document.querySelector('#wifi-icon').setAttribute('class', 'bi bi-wifi-2')
          document.querySelector('#wifi-icon').setAttribute('style', "width:50; height:30; fill:#ffff00;")
          document.querySelector('.wifi-path0').setAttribute('d', "M13.229 8.271c.216-.216.194-.578-.063-.745A9.46 9.46 0 0 0 8 6c-1.905 0-3.68.56-5.166 1.526a.48.48 0 0 0-.063.745.525.525 0 0 0 .652.065A8.46 8.46 0 0 1 8 7a8.46 8.46 0 0 1 4.577 1.336c.205.132.48.108.652-.065m-2.183 2.183c.226-.226.185-.605-.1-.75A6.5 6.5 0 0 0 8 9c-1.06 0-2.062.254-2.946.704-.285.145-.326.524-.1.75l.015.015c.16.16.408.19.611.09A5.5 5.5 0 0 1 8 10c.868 0 1.69.201 2.42.56.203.1.45.07.611-.091zM9.06 12.44c.196-.196.198-.52-.04-.66A2 2 0 0 0 8 11.5a2 2 0 0 0-1.02.28c-.238.14-.236.464-.04.66l.706.706a.5.5 0 0 0 .708 0l.707-.707z")
          document.querySelector('.wifi-path1').setAttribute('d', "none")

        } else if (percent <= 33 && percent > 0) {

          document.querySelector('#wifi-icon').setAttribute('class', 'bi bi-wifi-1')
          document.querySelector('#wifi-icon').setAttribute('style', "width:50; height:30; fill:red;")
          document.querySelector('.wifi-path0').setAttribute('d', "M11.046 10.454c.226-.226.185-.605-.1-.75A6.5 6.5 0 0 0 8 9c-1.06 0-2.062.254-2.946.704-.285.145-.326.524-.1.75l.015.015c.16.16.407.19.611.09A5.5 5.5 0 0 1 8 10c.868 0 1.69.201 2.42.56.203.1.45.07.611-.091zM9.06 12.44c.196-.196.198-.52-.04-.66A2 2 0 0 0 8 11.5a2 2 0 0 0-1.02.28c-.238.14-.236.464-.04.66l.706.706a.5.5 0 0 0 .707 0l.708-.707z")
          document.querySelector('.wifi-path1').setAttribute('d', "none")
        } else {
          document.querySelector('#wifi-icon').setAttribute('class', 'bi bi-wifi-off')
          document.querySelector('#wifi-icon').setAttribute('style', "width:50; height:30; fill:red;")
          document.querySelector('.wifi-path0').setAttribute('d', "M10.706 3.294A12.6 12.6 0 0 0 8 3C5.259 3 2.723 3.882.663 5.379a.485.485 0 0 0-.048.736.52.52 0 0 0 .668.05A11.45 11.45 0 0 1 8 4q.946 0 1.852.148zM8 6c-1.905 0-3.68.56-5.166 1.526a.48.48 0 0 0-.063.745.525.525 0 0 0 .652.065 8.45 8.45 0 0 1 3.51-1.27zm2.596 1.404.785-.785q.947.362 1.785.907a.482.482 0 0 1 .063.745.525.525 0 0 1-.652.065 8.5 8.5 0 0 0-1.98-.932zM8 10l.933-.933a6.5 6.5 0 0 1 2.013.637c.285.145.326.524.1.75l-.015.015a.53.53 0 0 1-.611.09A5.5 5.5 0 0 0 8 10m4.905-4.905.747-.747q.886.451 1.685 1.03a.485.485 0 0 1 .047.737.52.52 0 0 1-.668.05 11.5 11.5 0 0 0-1.811-1.07M9.02 11.78c.238.14.236.464.04.66l-.707.706a.5.5 0 0 1-.707 0l-.707-.707c-.195-.195-.197-.518.04-.66A2 2 0 0 1 8 11.5c.374 0 .723.102 1.021.28zm4.355-9.905a.53.53 0 0 1 .75.75l-10.75 10.75a.53.53 0 0 1-.75-.75z")
          document.querySelector('.wifi-path1').setAttribute('d', "none")
        }
      } else {
        document.querySelector('#wifi-icon').setAttribute('class', 'bi bi-wifi-off')
        document.querySelector('#wifi-icon').setAttribute('style', "width:50; height:30; fill:red;")
        document.querySelector('.wifi-path0').setAttribute('d', "M10.706 3.294A12.6 12.6 0 0 0 8 3C5.259 3 2.723 3.882.663 5.379a.485.485 0 0 0-.048.736.52.52 0 0 0 .668.05A11.45 11.45 0 0 1 8 4q.946 0 1.852.148zM8 6c-1.905 0-3.68.56-5.166 1.526a.48.48 0 0 0-.063.745.525.525 0 0 0 .652.065 8.45 8.45 0 0 1 3.51-1.27zm2.596 1.404.785-.785q.947.362 1.785.907a.482.482 0 0 1 .063.745.525.525 0 0 1-.652.065 8.5 8.5 0 0 0-1.98-.932zM8 10l.933-.933a6.5 6.5 0 0 1 2.013.637c.285.145.326.524.1.75l-.015.015a.53.53 0 0 1-.611.09A5.5 5.5 0 0 0 8 10m4.905-4.905.747-.747q.886.451 1.685 1.03a.485.485 0 0 1 .047.737.52.52 0 0 1-.668.05 11.5 11.5 0 0 0-1.811-1.07M9.02 11.78c.238.14.236.464.04.66l-.707.706a.5.5 0 0 1-.707 0l-.707-.707c-.195-.195-.197-.518.04-.66A2 2 0 0 1 8 11.5c.374 0 .723.102 1.021.28zm4.355-9.905a.53.53 0 0 1 .75.75l-10.75 10.75a.53.53 0 0 1-.75-.75z")
        document.querySelector('.wifi-path1').setAttribute('d', "none")
      }
    })
    .catch(function (err) {
      console.error('error rendering wifi strength', err)
    })


}

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
    updateStats();
    setInterval(updateStats, 15000);
    pollRadioFirmware();
  });
  socket.onopen = function (event) {
    console.log('hello connection established')
  }
  socket.onmessage = function (msg) {
    let data = JSON.parse(msg.data);
    let tr, td;
    switch (data.msg_type) {
      case ('beep'):
        handle_beep(data);
        break;
      case ('blu'):
        handle_beep(data);
        poll_interval = data.poll_interval
        handle_poll(data);
        break;
      case ('blu_stats'):
        handle_blu_stats(data);
      case ('blu_dropped'):
        handle_blu_dropped(data);
        break;
      case ('poll_interval'):
        handle_poll(data)
        break;
      case ('add_port'):
        handle_add_port(data)
        break;
      case ('unlink_port'):
        handle_blu_unlink(data)
        break;
      case ('unlink_dongle'):
        unlink_dongle = data.port
        handle_dongle_unlink(data)
        break;
      case ('stats'):
        handle_stats(data);
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
        Object.keys(data.firmware).forEach((channel) => {
          const firmware = data.firmware[channel]
          document.querySelector(`#radio-firmware-version-${channel}`).textContent = firmware
        })
        break
      case ('blu-firmware'):
        Object.keys(data.firmware).forEach((port) => {
          Object.keys(data.firmware[port].channels).forEach((channel) => {
            const firmware = data.firmware[port].channels[channel]
            document.querySelector(`#blu-firmware-version-${port}-${channel}`).textContent = firmware
          })
        })
        break
      default:
        console.log('WTF dunno', data);
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
  // tr.setAttribute('style', 'color:#111;')
  tr.setAttribute('style', 'color:#fff;')
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
  // div.appendChild(col_sm) // turning off ook button
  wrapper.appendChild(div)

  return wrapper
};

const build_blu_receiver = function (port) {
  let wrapper = document.createElement('div')

  if (blu_ports.includes(port)) {
    wrapper.setAttribute('style', 'display:\'\'')

  } else {
    wrapper.setAttribute('style', 'display:none')
  }

  wrapper.setAttribute('class', 'container')
  wrapper.setAttribute('id', `blu-receiver-${port}`)

  let h2 = document.createElement('h2')
  h2.setAttribute('style', 'text-align: center; color: #007FFF; margin:30')
  h2.setAttribute('id', `blu-port-${port}`)
  h2.setAttribute('padding', '10')

  let row = document.createElement('div')
  row.classList.add('row')
  row.setAttribute('id', `blu-receiver-${port}-row`)

  h2.textContent = `Bl${umacr} Receiver on USB Port ` + port
  // h2.setAttribute('style', 'margin:30')
  wrapper.appendChild(h2)

  // row.appendChild(div) // this needs to go under #blu-receiver-1-row
  wrapper.appendChild(row)

  return wrapper
}

const build_blu_radio = function (port, radio) {
  let wrapper = document.createElement('div')
  wrapper.setAttribute('id', `blu-radio-${port}-${radio}`)
  let h3 = document.createElement('h3')
  h3.setAttribute('style', 'text-align: center; color: #0dcaf0; margin:30')
  h3.textContent = `Bl${umacr} Radio ` + radio
  // h3.setAttribute('margin', 30)

  wrapper.appendChild(h3)
  const version_label = document.createElement('span')
  version_label.textContent = 'version: '
  const firmware_version = document.createElement('span')
  firmware_version.setAttribute('id', `blu-firmware-version-${port}-${radio}`)
  const firmware = document.createElement('div')
  firmware.appendChild(version_label)
  firmware.appendChild(firmware_version)
  wrapper.appendChild(firmware)

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
  row = build_row({ header: 'Poll Interval (s)', id: `poll_interval_${port}-${radio}` })
  table.appendChild(row)
  wrapper.appendChild(table)
  let div = document.createElement('div')
  div.setAttribute('style', 'overflow:scroll; height:400px;')
  table = document.createElement('table')
  table.setAttribute('class', 'table table-sm table-bordered table-dark radio')
  table.setAttribute('id', `blu-radio_${port}-${radio}`)
  tr = document.createElement('tr')
  tr.setAttribute('class', 'table-primary')
  // tr.setAttribute('style', 'color:#111;')
  tr.setAttribute('style', 'color:#fff;')
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
  th = document.createElement('th')
  th.textContent = 'Voltage (V)'
  tr.appendChild(th)
  th = document.createElement('th')
  th.textContent = 'Temp (C)'
  tr.appendChild(th)
  table.appendChild(tr)
  div.appendChild(table)
  wrapper.appendChild(div)

  // div = document.createElement('div')
  // div.setAttribute('class', 'row')

  return wrapper
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
      blu_ports.forEach((port) => {
        document.querySelector(`#blu-receiver-${port}`).style.display = ''
      })
    }

    const render_interfaces = function () {
      render_gateway()
      render_wifi()
      render_modem()
    }

    document.querySelector('#sg_link').setAttribute('href', 'http://' + window.location.hostname + ':3010');
    // render_gateway()
    // render_wifi()
    // render_modem()
    render_interfaces()
    initialize_reboot()
    setInterval(render_interfaces, 60000)
    let blu_receiver, blu_radio, component, col, row, div
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
      col.setAttribute('id', `dongle-radio-${i}`)
      col.setAttribute('style', 'display:none')
      col.appendChild(component)
      document.querySelector('#extra-radios').appendChild(col)
    }

    for (let i = 1; i <= 7; i++) {
      blu_receiver = build_blu_receiver(i)

      document.querySelector('#blu-receiver').appendChild(blu_receiver)

      for (let j = 1; j <= 4; j++) {
        blu_radio = build_blu_radio(i, j)
        blu_radio.setAttribute('id', `blu-radio-${i}-${j}`)

        col = document.createElement('div')
        col.classList.add('col-sm')
        col.setAttribute('id', `blu-column-${i}-${j}`)
        col.appendChild(blu_radio)
        document.querySelector(`#blu-receiver-${i}-row`).append(col)
      }
    }

    initialize_websocket();
    initialize_controls();
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