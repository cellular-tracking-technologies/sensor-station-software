export default [
    {
        version: '1.0.0',
        date: '2023-08-02',
        features: [
            'Station Stats menu option on LCD interface',
            'LCD menu translations for Spanish, French, Portuguese, and Dutch',
            'Enable/disable options for WiFi on LCD interface',
            'Enable/disable options for cell modem on LCD interface',
            'Option to program 434 radios to latest firmware (v4)',
            'Enable/disable options Wifi and cellular modem signal strength on web interface',
            'Hide/display 434 radios, dongle radios, and Blū receivers',
            'Filter tag IDs across 434 and Blū radios',
        ],
        changes: [
            'Updated Node to v20.14.0',
            'Updated Linux kernel to v6.1.21-v7+',
            'Switched modem protocol from PPP to QMI',
            'Using ModemManager to manage and connect to cellular networks and to provide stats on connection',
            'Using NetworkManager rather than dhcpcd to connect and manage to WiFi/ethernet connections',
            'Add wifi credentials through USB with nmcli commands instead of modifying wpa_supplicant.conf',
            'Organized BlūSeries and Atmega32 directories within hardware/ ctt directory',
            'Compatible with Node v3',
            '434 and Blū tags detected by a Node appear in 434 tables configured for detecting Nodes',
            '434 MHz radios upgraded to v4.0.0 firmware(previously v3.0.1)',
            'Dynamically add / remove USB radios',
        ],
        bugs: [
            'Sharing wifi over ethernet does not work with two USB-ethernet adapters',
        ],
        removed: [
            'Bookworm OS, currently using Bullseye v11',
        ],
        fixed: [
            'Station Update button on Web Interface',
            'Station time is on UTC',
        ],
        security: [],
    },
    {
        version: '1.0.0',
        date: '2023-01-24',
        features: [
            'Detect BluMorpho Tags',
            'Dynamic blu-receiver instantiation and display',
            'Individual blu-receiver and blu-radio control',
        ],
        bugs: [
            'Fixed multiple radio instantiation.',
        ],
        security: [],
    }]