let beeps = [];
let tags = new Set();
let nodes = {};
let beep_hist = {};

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
};

const format_beep = function (beep) {
  if (beep.data) {
    let tag_id, rssi, node_id, tag_at;
    let beep_at = moment(new Date(beep.received_at)).utc();
    tag_at = beep_at;
    if (beep.protocol) {
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
      received_at: beep_at,
      tag_at: tag_at
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
    }
  }
  let BEEP_TABLE = document.querySelector('#radio_' + beep.channel);
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
    let beeps, node_beeps, telemetry_beeps;
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
      telemetry_beeps: telemetry_beeps
    };
  });
  nodes = reports;
  render_nodes(reports);
  render_channel_stats(channel_stats);
};

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

const initialize_websocket = function () {
  let url = 'ws://' + window.location.hostname + ':8001';
  socket = new WebSocket(url);
  socket.addEventListener('close', (event) => {
    alert('Station connection disconnected - you will need to restart your browser once the radio software has restarted');
  });
  socket.addEventListener('open', (event) => {
    updateStats();
    setInterval(updateStats, 15000);
  });
  socket.onmessage = function (msg) {
    let data = JSON.parse(msg.data);
    let tr, td;
    switch (data.msg_type) {
      case ('beep'):
        handle_beep(data);
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

const build_version_element = function(opts) {
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

const build_sg_tag_file_upload = function() {

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
  document.querySelector('#sg_link').setAttribute('href', 'http://' + window.location.hostname + ':3010');
  render_gateway()
  initialize_reboot()
  setInterval(render_gateway, 5000)
  let component, col
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