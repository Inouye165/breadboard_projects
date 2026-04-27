export type CatalogItem = {
  id: string
  name: string
  description: string
  pinCount?: number
  tags?: string[]
}

export type CatalogCategoryId =
  | 'microcontrollers'
  | 'sbc'
  | 'modules'
  | 'passives'
  | 'leds'
  | 'sensors'

export type CatalogCategory = {
  id: CatalogCategoryId
  label: string
  blurb: string
  items: CatalogItem[]
}

export const COMPONENT_CATALOG: CatalogCategory[] = [
  {
    id: 'microcontrollers',
    label: 'Microcontrollers',
    blurb: 'Brains for breadboard projects. Drop one onto a breadboard and wire it up.',
    items: [
      {
        id: 'esp32-devkit-v1',
        name: 'ESP32 DevKit V1',
        description: '38-pin Wi-Fi + Bluetooth dev board. Spans the breadboard center channel.',
        pinCount: 38,
        tags: ['wifi', 'bluetooth', '3.3v'],
      },
      {
        id: 'esp8266-nodemcu',
        name: 'ESP8266 NodeMCU',
        description: 'Compact Wi-Fi board, great for sensors that report to the cloud.',
        pinCount: 30,
        tags: ['wifi', '3.3v'],
      },
      {
        id: 'arduino-nano',
        name: 'Arduino Nano',
        description: 'Classic 5V microcontroller, breadboard-friendly footprint.',
        pinCount: 30,
        tags: ['5v', 'usb'],
      },
      {
        id: 'arduino-uno',
        name: 'Arduino Uno',
        description: 'The standard learning board. Lives next to the breadboard via jumper wires.',
        pinCount: 32,
        tags: ['5v', 'shield'],
      },
      {
        id: 'rpi-pico',
        name: 'Raspberry Pi Pico / Pico W',
        description: 'RP2040 microcontroller. The W variant adds Wi-Fi.',
        pinCount: 40,
        tags: ['3.3v', 'rp2040'],
      },
      {
        id: 'seeed-xiao-esp32c3',
        name: 'Seeed XIAO ESP32-C3',
        description: 'Tiny Wi-Fi/BLE board for compact builds.',
        pinCount: 14,
        tags: ['wifi', 'bluetooth', 'tiny'],
      },
    ],
  },
  {
    id: 'sbc',
    label: 'Single-Board Computers',
    blurb: 'Full Linux boards. Connect to your breadboard via the GPIO header.',
    items: [
      {
        id: 'rpi-5',
        name: 'Raspberry Pi 5',
        description: '40-pin GPIO header. Use a ribbon + cobbler to fan out onto a breadboard.',
        pinCount: 40,
        tags: ['linux', 'gpio'],
      },
      {
        id: 'rpi-4',
        name: 'Raspberry Pi 4',
        description: 'Same 40-pin header as the Pi 5. Plenty of compute for sensors and cameras.',
        pinCount: 40,
        tags: ['linux', 'gpio'],
      },
      {
        id: 'rpi-zero-2w',
        name: 'Raspberry Pi Zero 2 W',
        description: 'Small Linux board with Wi-Fi. Solder a header for breadboard wiring.',
        pinCount: 40,
        tags: ['linux', 'wifi'],
      },
    ],
  },
  {
    id: 'modules',
    label: 'Modules',
    blurb: 'Pre-built breakout boards that plug into the breadboard.',
    items: [
      {
        id: 'relay-1ch',
        name: '1-Channel Relay Module',
        description: 'Switch mains-level loads from a 5V GPIO pin.',
        pinCount: 3,
        tags: ['relay', '5v'],
      },
      {
        id: 'l298n',
        name: 'L298N Motor Driver',
        description: 'Drive two DC motors or one stepper. Needs external motor supply.',
        pinCount: 4,
        tags: ['motor'],
      },
      {
        id: 'ds3231',
        name: 'DS3231 RTC',
        description: 'Battery-backed real-time clock over I2C.',
        pinCount: 4,
        tags: ['i2c', 'rtc'],
      },
      {
        id: 'ssd1306',
        name: 'SSD1306 OLED 128x64',
        description: 'Tiny monochrome display over I2C. Four wires and you have a screen.',
        pinCount: 4,
        tags: ['i2c', 'display'],
      },
      {
        id: 'pca9685',
        name: 'PCA9685 16-Ch PWM',
        description: 'Drive 16 servos or LEDs from two I2C pins.',
        pinCount: 6,
        tags: ['i2c', 'pwm', 'servo'],
      },
    ],
  },
  {
    id: 'passives',
    label: 'Passives',
    blurb: 'Resistors and capacitors - the supporting cast.',
    items: [
      {
        id: 'resistor-220',
        name: 'Resistor - 220 ohm',
        description: 'Standard LED current-limiter at 5V.',
        pinCount: 2,
        tags: ['1/4W'],
      },
      {
        id: 'resistor-330',
        name: 'Resistor - 330 ohm',
        description: 'Gentler LED current-limiter at 5V or 3.3V.',
        pinCount: 2,
      },
      {
        id: 'resistor-1k',
        name: 'Resistor - 1k ohm',
        description: 'General-purpose pull-up / pull-down.',
        pinCount: 2,
      },
      {
        id: 'resistor-10k',
        name: 'Resistor - 10k ohm',
        description: 'Classic pull-up for buttons and I2C.',
        pinCount: 2,
      },
      {
        id: 'cap-100nf',
        name: 'Capacitor - 100 nF ceramic',
        description: 'Decoupling cap. Place near the chip power pins.',
        pinCount: 2,
      },
      {
        id: 'cap-10uf',
        name: 'Capacitor - 10 uF electrolytic',
        description: 'Bulk decoupling for noisy supplies. Mind the polarity.',
        pinCount: 2,
        tags: ['polarized'],
      },
    ],
  },
  {
    id: 'leds',
    label: 'LEDs & Indicators',
    blurb: 'Visible feedback for your circuit.',
    items: [
      {
        id: 'led-red',
        name: 'LED - Red 5mm',
        description: 'Standard indicator. Pair with a 220 ohm resistor at 5V.',
        pinCount: 2,
        tags: ['polarized'],
      },
      {
        id: 'led-green',
        name: 'LED - Green 5mm',
        description: 'Standard green indicator.',
        pinCount: 2,
        tags: ['polarized'],
      },
      {
        id: 'led-rgb',
        name: 'RGB LED (common cathode)',
        description: 'Three LEDs in one package. Needs three current-limit resistors.',
        pinCount: 4,
      },
      {
        id: 'buzzer-active',
        name: 'Active Buzzer',
        description: 'Drive HIGH for a tone. Two pins.',
        pinCount: 2,
      },
    ],
  },
  {
    id: 'sensors',
    label: 'Sensors',
    blurb: 'Inputs from the physical world.',
    items: [
      {
        id: 'dht22',
        name: 'DHT22 Temperature/Humidity',
        description: 'Single-wire digital temperature + humidity sensor.',
        pinCount: 4,
      },
      {
        id: 'bme280',
        name: 'BME280 Pressure/Temp/Humidity',
        description: 'I2C environmental sensor with great accuracy.',
        pinCount: 4,
        tags: ['i2c'],
      },
      {
        id: 'hc-sr04',
        name: 'HC-SR04 Ultrasonic',
        description: 'Distance sensor up to ~4 m. Trigger + echo pins.',
        pinCount: 4,
      },
      {
        id: 'pir',
        name: 'PIR Motion Sensor',
        description: 'Detects motion. Outputs HIGH when triggered.',
        pinCount: 3,
      },
      {
        id: 'ldr',
        name: 'LDR (light)',
        description: 'Photoresistor. Use with a 10k pull-down to read on an analog pin.',
        pinCount: 2,
      },
    ],
  },
]
