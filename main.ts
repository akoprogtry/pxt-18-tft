// Wukong-compatible TFT library (ST7735 / TK89)
// Pins are configurable

namespace TFT {

    let TFTWIDTH = 160
    let TFTHEIGHT = 128

    // ==== CONFIGURE YOUR PINS HERE ====
    let CS_PIN = DigitalPin.P0
    let DC_PIN = DigitalPin.P1
    let RST_PIN = DigitalPin.P8

    enum TFTCommands {
        SWRESET = 0x01,
        SLPOUT = 0x11,
        DISPON = 0x29,
        CASET = 0x2A,
        RASET = 0x2B,
        RAMWR = 0x2C,
        MADCTL = 0x36,
        COLMOD = 0x3A
    }

    export enum Color {
        Black = 0x0000,
        White = 0xFFFF,
        Red = 0xF800,
        Green = 0x07E0,
        Blue = 0x001F,
        Yellow = 0xFFE0
    }

    export function init(): void {
        pins.spiFrequency(8000000)

        pins.digitalWritePin(RST_PIN, 1)
        basic.pause(50)
        pins.digitalWritePin(RST_PIN, 0)
        basic.pause(50)
        pins.digitalWritePin(RST_PIN, 1)
        basic.pause(50)

        send(TFTCommands.SWRESET)
        basic.pause(150)
        send(TFTCommands.SLPOUT)
        basic.pause(150)

        sendData(TFTCommands.COLMOD, [0x05]) // 16-bit
        sendData(TFTCommands.MADCTL, [0xA0])

        send(TFTCommands.DISPON)
        basic.pause(100)
    }

    export function clear(color: Color): void {
        fillRect(0, 0, TFTWIDTH, TFTHEIGHT, color)
    }

    export function drawPixel(x: number, y: number, color: Color): void {
        setAddrWindow(x, y, x, y)
        writeColor(color)
    }

    export function fillRect(x: number, y: number, w: number, h: number, color: Color) {
        setAddrWindow(x, y, x + w - 1, y + h - 1)

        pins.digitalWritePin(DC_PIN, 1)
        pins.digitalWritePin(CS_PIN, 0)

        for (let i = 0; i < w * h; i++) {
            pins.spiWrite(color >> 8)
            pins.spiWrite(color & 0xFF)
        }

        pins.digitalWritePin(CS_PIN, 1)
    }

    function setAddrWindow(x0: number, y0: number, x1: number, y1: number) {
        sendData(TFTCommands.CASET, [0x00, x0, 0x00, x1])
        sendData(TFTCommands.RASET, [0x00, y0, 0x00, y1])
        send(TFTCommands.RAMWR)
    }

    function writeColor(color: number) {
        pins.digitalWritePin(DC_PIN, 1)
        pins.digitalWritePin(CS_PIN, 0)

        pins.spiWrite(color >> 8)
        pins.spiWrite(color & 0xFF)

        pins.digitalWritePin(CS_PIN, 1)
    }

    function send(cmd: number) {
        pins.digitalWritePin(DC_PIN, 0)
        pins.digitalWritePin(CS_PIN, 0)

        pins.spiWrite(cmd)

        pins.digitalWritePin(CS_PIN, 1)
    }

    function sendData(cmd: number, data: number[]) {
        send(cmd)

        pins.digitalWritePin(DC_PIN, 1)
        pins.digitalWritePin(CS_PIN, 0)

        for (let d of data) {
            pins.spiWrite(d)
        }

        pins.digitalWritePin(CS_PIN, 1)
    }
}
