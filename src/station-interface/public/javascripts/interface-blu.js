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

const initialize_blu_controls = function () {
    // Blu Buttons for Each Port that controls all radios on receiver
    document.querySelectorAll('button[name="all_radios_on"]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            let port = e.target.getAttribute('value')
            let res = window.prompt(`Turn on all Bl${umacr} Radios on USB Port ${port} and setting polling interval as:`)
            res = Number(res) * 1000
            if (isNaN(res) === true || res === 0) {
                window.alert('Invalid Input, please enter an integer (number with no decimals).')
            } else {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'blu_radio_all_on',
                    data: {
                        port: port,
                        poll_interval: res,
                        scan: 1,
                        rx_blink: 1,
                    }
                }));
            }
        })
    })

    document.querySelectorAll('button[name="all_radios_off"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            let port = e.target.getAttribute('value')
            let res = window.confirm(`Are you sure you want to turn all Bl${umacr} Series Radios off on USB Port ${port}?`);
            if (res) {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'blu_radio_all_off',
                    data: {
                        port: port,
                        scan: 0,
                        rx_blink: 0,
                    }
                }));
            }
        })
    })

    document.querySelectorAll('button[name="all_radios_leds_on"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {

            let port = e.target.getAttribute('value')
            let res = window.confirm(`Are you sure you want to switch Blu Series Radios on USB Port ${port} LED On?`);
            if (res) {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'blu_led_all',
                    data: {
                        type: 'led_on',
                        port: port,
                        scan: 1,
                        rx_blink: 1,
                    }
                }));
            }
        });
    });

    document.querySelectorAll('button[name="all_radios_leds_off"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {

            let port = e.target.getAttribute('value')
            let res = window.confirm(`Are you sure you want to switch Blu Series Radios on USB Port ${port} LED On?`);
            if (res) {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'blu_led_all',
                    data: {
                        type: 'led_off',
                        port: port,
                        scan: 1,
                        rx_blink: 0,
                    }
                }));
            }
        });
    });

    document.querySelectorAll('button[name="all_radios_reboot"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            let port = e.target.getAttribute('value')
            let res = window.confirm(`Are you sure you want to reboot all the radios on USB Port ${port}?`);
            if (res) {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'blu_reboot_all',
                    data: {
                        type: 'reboot_blu_radio',
                        port: port,
                        scan: 1,
                        rx_blink: 1,
                    }
                }));
            }
        });
    });

    document.querySelectorAll('button[name="all_radios_poll"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            let port = e.target.getAttribute('value')
            let res = window.prompt('Enter polling interval in seconds (s) for USB Port ' + port +
                ' radios.');
            res = Number(res) * 1000
            poll_interval = res ? res : 10000
            if (isNaN(res) === true || res === 0) {
                window.alert('Invalid Input, please enter an integer (number with no decimals).')
            } else {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'all_change_poll',
                    data: {
                        type: 'change_poll',
                        poll_interval: res,
                        port: port,
                        scan: 1,
                        rx_blink: 1,
                    }
                }));
            }
        });
    });

    document.querySelectorAll('button[name="all_radios_update"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            let port = e.target.getAttribute('value')
            let res = window.confirm('Are you sure you want to update Blu Series Radios on USB Port ' + port + '?');
            if (res) {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'blu_update_all',
                    data: {
                        type: 'update-firmware',
                        port: port,
                        poll_interval: 10000,
                        scan: 1,
                        rx_blink: 1,
                    }
                }));
            }
        });
    });

    // Blu Buttons for Individual Radios on Receivers
    document.querySelectorAll('button[name="toggle_radio_on"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            let port = e.target.getAttribute('value').substring(0, 1)
            let radio_id = e.target.getAttribute('value').substring(2)
            let res = window.prompt(`Turning on all Bl${umacr} Radios on USB Port ${port} and setting polling interval as:`);
            res = Number(res) * 1000
            if (isNaN(res) === true || res === 0) {
                window.alert('Invalid Input, please enter an integer (number with no decimals).')
            } else {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'toggle_blu',
                    data: {
                        type: 'blu_on',
                        channel: radio_id,
                        port: port,
                        poll_interval: res,
                        scan: 1,
                        rx_blink: 1,
                    }
                }));
            }
        })
    })

    document.querySelectorAll('button[name="toggle_radio_off"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            let port = e.target.getAttribute('value').substring(0, 1)
            let radio_id = e.target.getAttribute('value').substring(2)
            let res = window.confirm(`Are you sure you want to turn all Bl${umacr} Series Radios off on USB Port ${port}?`);
            if (res) {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'toggle_blu',
                    data: {
                        type: 'blu_off',
                        channel: radio_id,
                        port: port,
                        scan: 0,
                        rx_blink: 0,
                    }
                }));
            }
        })
    })

    document.querySelectorAll('button[name="toggle_radio_led_on"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {

            let port = e.target.getAttribute('value').substring(0, 1)
            let radio_id = e.target.getAttribute('value').substring(2)
            let res = window.confirm(`Are you sure you want to switch Blu Series Radios on USB Port ${port} LED On?`);
            if (res) {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'toggle_blu_led',
                    data: {
                        type: 'led_on',
                        channel: radio_id,
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
            let port = e.target.getAttribute('value').substring(0, 1)
            let radio_id = e.target.getAttribute('value').substring(2)
            let res = window.confirm(`Are you sure you want to switch Blu Series Radio LEDs on USB Port ${port} Off?`);
            if (res) {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'toggle_blu_led',
                    data: {
                        type: 'led_off',
                        channel: radio_id,
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
            let port = e.target.getAttribute('value').substring(0, 1)
            let radio_id = e.target.getAttribute('value').substring(2)
            let res = window.confirm(`Are you sure you want to reboot Radio ${radio_id} on USB Port ${port}?`);
            if (res) {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'reboot_blu_radio',
                    data: {
                        type: 'reboot_blu_radio',
                        channel: radio_id,
                        port: port,
                        scan: 1,
                        rx_blink: 1,
                    }
                }));
            }
        });
    });
    document.querySelectorAll('button[name="radio_polling"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            let port = e.target.getAttribute('value').substring(0, 1)
            let radio_id = e.target.getAttribute('value').substring(2)
            let res = window.prompt('Enter polling interval in seconds (s) for USB Port ' + port +
                ' radios.');
            res = Number(res) * 1000
            poll_interval = res ? res : 10000
            if (isNaN(res) === true || res === 0) {
                window.alert('Invalid Input, please enter an integer (number with no decimals).')
            } else {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'change_poll',
                    data: {
                        type: 'change_poll',
                        poll_interval: res,
                        port: port,
                        channel: radio_id,
                        scan: 1,
                        rx_blink: 1,
                    }
                }));
            }
        });
    });
    document.querySelectorAll('button[name="update_blu_firmware"]').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            let port = e.target.getAttribute('value').substring(0, 1)
            let radio_id = e.target.getAttribute('value').substring(2)
            let res = window.confirm('Are you sure you want to update Blu Series Radios on USB Port ' + port + '?');
            if (res) {
                socket.send(JSON.stringify({
                    msg_type: 'cmd',
                    cmd: 'update-blu-firmware',
                    data: {
                        type: 'update-firmware',
                        channel: radio_id,
                        port: port,
                        poll_interval: 10000,
                    }
                }));
            }
        });
    });

    document.querySelectorAll('#bluRadioSwitch').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            if (document.querySelector('#blu-receiver').style.display !== 'none') {
                document.querySelector('#blu-receiver').style.display = 'none'

            } else {
                document.querySelector('#blu-receiver').style.display = ''


            }
        })
    })

    document.querySelector('#download-nodes').addEventListener('click', function (evt) {
        download_node_health();
    });

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
}

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
            case 'blu_tag':
                handle_blu_beep(format_beep(beep));
                poll_interval = beep.poll_interval;
                break;
            default:
                break;
        }
        return;
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
    tr.style.border = "2px solid #22dd22";
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
}

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
        });
    };
    nodes = reports;

    render_nodes(reports);
    // render_channel_stats(channel_stats);
};


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

const createElement = function (text) {
    let td = document.createElement('td');
    td.textContent = text;
    return td;
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
    // console.log('handle blu stats blu stats after calc', blu_stats)
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
                    document.querySelector(blu_beep_info).textContent = stats > 0 ? stats : 0
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
                document.querySelector(blu_stat_info).textContent = stats_blu > 0 ? stats_blu : 0
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

const initialize_websocket = function () {
    let url = 'ws://' + window.location.hostname + ':8001';
    socket = new WebSocket(url);
    socket.addEventListener('close', (event) => {
        alert('Station connection disconnected - you will need to restart your browser once the radio software has restarted');
    });
    socket.addEventListener('open', (event) => {
        console.log('open event', event)
    });
    socket.onopen = function (event) {
        console.log('hello connection established')
        console.log('socket on open event', event)
    }
    socket.onmessage = function (msg) {
        let data = JSON.parse(msg.data);
        switch (data.msg_type) {
            case ('blu'):
                handle_beep(data);
                poll_interval = data.poll_interval
                handle_poll(data);
                break;
            case ('blu_stats'):
                handle_blu_stats(data);
                break
            case ('blu_dropped'):
                handle_blu_dropped(data);
                break;
            case ('poll_interval'):
                handle_poll(data)
                break;
            case ('add_port'):
                handle_add_port(data)
                break
            case ('unlink_port'):
                handle_blu_unlink(data)
                break;
            case ('blu-firmware'):
                Object.keys(data.firmware).forEach((port) => {
                    Object.keys(data.firmware[port].channels).forEach((channel) => {
                        const firmware = data.firmware[port].channels[channel]
                        document.querySelector(`#blu-firmware-version-${port}-${channel}`).textContent = firmware
                    })
                })
                break
            case ('stats'):
                handle_stats(data);
                break;
            default:
                // console.log('WTF dunno', data);
                break
        };
    };
}


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



    // Create All Radios On button
    let div = document.createElement('div')
    div.setAttribute('class', 'row')
    div.setAttribute('id', 'blu-port-buttons')
    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-lg btn-primary')
    button.setAttribute('name', 'all_radios_on')
    button.setAttribute('value', port)
    button.textContent = 'All Radios On'
    col_sm.appendChild(button)
    div.appendChild(col_sm)

    // Create All Radios Off Button
    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-lg btn-primary')
    button.setAttribute('name', 'all_radios_off')
    button.setAttribute('value', port)
    button.textContent = 'All Radios Off'
    col_sm.appendChild(button)
    div.appendChild(col_sm)

    // Create All Radio Leds On Button
    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-lg btn-primary')
    button.setAttribute('name', 'all_radios_leds_on')
    button.setAttribute('value', port)
    button.textContent = 'All Radios LEDs On'
    col_sm.appendChild(button)
    div.appendChild(col_sm)

    // Create All Radio Leds Off Button
    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-lg btn-primary')
    button.setAttribute('name', 'all_radios_leds_off')
    button.setAttribute('value', port)
    button.textContent = 'All Radios LEDs Off'
    col_sm.appendChild(button)
    div.appendChild(col_sm)

    // Create All Radio Change Poll Button
    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-lg btn-primary')
    button.setAttribute('name', 'all_radios_poll')
    button.setAttribute('value', port)
    button.textContent = 'All Radios Change Poll'
    col_sm.appendChild(button)
    div.appendChild(col_sm)

    // Create All Radio Reboot Button
    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-lg btn-primary')
    button.setAttribute('name', 'all_radios_reboot')
    button.setAttribute('value', port)
    button.textContent = 'All Radios Reboot'
    col_sm.appendChild(button)
    div.appendChild(col_sm)

    // // Create All Blu FW Updater Button
    // col_sm = document.createElement('div')
    // col_sm.setAttribute('class', 'col-sm')
    // button = document.createElement('button')
    // button.setAttribute('class', 'btn btn-lg btn-primary')
    // button.setAttribute('name', 'all_radios_update')
    // button.setAttribute('value', port)
    // button.textContent = 'Update All Radio Firmware'
    // col_sm.appendChild(button)
    // div.appendChild(col_sm)

    h2.textContent = `Bl${umacr} Receiver on USB Port ` + port
    wrapper.appendChild(h2)

    row.appendChild(div)
    wrapper.appendChild(row)

    return wrapper
}

const build_blu_radio = function (port, radio) {
    let wrapper = document.createElement('div')
    wrapper.setAttribute('id', `blu-radio-${port}-${radio}`)
    let h3 = document.createElement('h3')
    h3.setAttribute('style', 'text-align: center; color: #0dcaf0; margin:30')
    h3.textContent = `Bl${umacr} Radio ` + radio

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

    return wrapper
}

const build_blu_buttons = function (port, radio) {
    let div = document.createElement('div')
    div.setAttribute('class', 'row')
    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-sm btn-info')
    button.setAttribute('name', 'toggle_radio_on')
    button.setAttribute('value', `${port}-${radio}`)
    button.textContent = 'Radio On'
    col_sm.appendChild(button)
    div.appendChild(col_sm)
    document.querySelector(`#blu-column-${port}-${radio}`).appendChild(div)

    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-sm btn-info')
    button.setAttribute('name', 'toggle_radio_off')
    button.setAttribute('value', `${port}-${radio}`)
    button.textContent = 'Radio Off'
    col_sm.appendChild(button)
    div.appendChild(col_sm)
    document.querySelector(`#blu-column-${port}-${radio}`).appendChild(div)

    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-sm btn-info')
    button.setAttribute('name', 'toggle_radio_led_on')
    button.setAttribute('value', `${port}-${radio}`)
    button.textContent = 'Radio LED On'
    col_sm.appendChild(button)
    div.appendChild(col_sm)
    document.querySelector(`#blu-column-${port}-${radio}`).appendChild(div)

    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-sm btn-info')
    button.setAttribute('name', 'toggle_radio_led_off')
    button.setAttribute('value', `${port}-${radio}`)
    button.textContent = 'Radio LED Off'
    col_sm.appendChild(button)
    div.appendChild(col_sm)
    document.querySelector(`#blu-column-${port}-${radio}`).appendChild(div)

    // Change Polling Interval
    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-sm btn-info')
    button.setAttribute('name', 'radio_polling')
    button.setAttribute('value', `${port}-${radio}`)
    button.textContent = `Change Polling Interval`
    col_sm.appendChild(button)
    div.appendChild(col_sm)
    document.querySelector(`#blu-column-${port}-${radio}`).appendChild(div)

    // Reboot Radio
    col_sm = document.createElement('div')
    col_sm.setAttribute('class', 'col-sm')
    button = document.createElement('button')
    button.setAttribute('class', 'btn btn-sm btn-info')
    button.setAttribute('name', 'reboot_blu_radio')
    button.setAttribute('value', `${port}-${radio}`)
    button.textContent = 'Reboot Radio'
    col_sm.appendChild(button)
    div.appendChild(col_sm)
    document.querySelector(`#blu-column-${port}-${radio}`).appendChild(div)


    // col_sm = document.createElement('div')
    // col_sm.setAttribute('class', 'col-sm')
    // button = document.createElement('button')
    // button.setAttribute('class', 'btn btn-sm btn-info')
    // button.setAttribute('name', 'update_blu_firmware')
    // button.setAttribute('value', `${port}-${radio}`)
    // button.textContent = `Update Bl${umacr} Radio Firmware`
    // col_sm.appendChild(button)
    // div.appendChild(col_sm)
    // document.querySelector(`#blu-column-${port}-${radio}`).appendChild(div)

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
        }

        let blu_receiver, blu_radio, component, col, row, div
        let max_row_count = localStorage.getItem('max-row-count')
        if (max_row_count) {
            MAX_ROW_COUNT = max_row_count
        } else {
            localStorage.setItem('max-row-count', MAX_ROW_COUNT)
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

                build_blu_buttons(i, j)

            }
        }

        initialize_websocket();
        initialize_blu_controls();
        RAW_LOG = document.querySelector('#raw_log');

    })();