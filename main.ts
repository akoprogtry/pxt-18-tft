// FINAL stable TFT library for Wukong + ST7735 (TK89)
// Clean, fast, and tested architecture

//% weight=100 color=#0fbc11 icon="\uf26c"
namespace TFT {

    const TFTWIDTH = 160
    const TFTHEIGHT = 128

    // ==== CONFIGURE YOUR PINS HERE ====
    let CS_PIN = DigitalPin.P0
    let DC_PIN = DigitalPin.P1
    let RST_PIN = DigitalPin.P8

    // ==== OPTIONAL OFFSETS (fix shifted image) ====
    let X_OFFSET = 0
    let Y_OFFSET = 0

    enum CMD {
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
        Yellow = 0xFFE0,
        Cyan = 0x07FF,
        Magenta = 0xF81F
    }

    //% block="init TFT"
    export function init(): void {
        pins.spiFrequency(4000000)
        pins.spiFormat(8, 0)

        // reset
        pins.digitalWritePin(RST_PIN, 0)
        basic.pause(20)
        pins.digitalWritePin(RST_PIN, 1)
        basic.pause(120)

        send(CMD.SWRESET)
        basic.pause(150)
        send(CMD.SLPOUT)
        basic.pause(150)

        sendData(CMD.COLMOD, [0x05]) // 16bit
        sendData(CMD.MADCTL, [0xA0]) // change if colors wrong

        // optional: invert colors if washed
        // send(0x21)

        send(CMD.DISPON)
        basic.pause(100)
    }

    //% block="clear %color"
    export function clear(color: Color): void {
        fillRect(0, 0, TFTWIDTH, TFTHEIGHT, color)
    }

    //% block="pixel x %x y %y color %color"
    export function pixel(x: number, y: number, color: Color) {
        if (x < 0 || y < 0 || x >= TFTWIDTH || y >= TFTHEIGHT) return

        setWindow(x, y, x, y)
        writeColor(color)
    }

    //% block="rect x %x y %y w %w h %h color %color"
    export function fillRect(x: number, y: number, w: number, h: number, color: Color) {
        if (w <= 0 || h <= 0) return

        let x1 = x + w - 1
        let y1 = y + h - 1

        clampWindow(x, y, x1, y1)
        setWindow(x, y, x1, y1)

        let hi = color >> 8
        let lo = color & 0xFF

        pins.digitalWritePin(DC_PIN, 1)
        pins.digitalWritePin(CS_PIN, 0)

        for (let i = 0; i < w * h; i++) {
            pins.spiWrite(hi)
            pins.spiWrite(lo)
        }

        pins.digitalWritePin(CS_PIN, 1)
    }

    // Bresenham line (fast)
    //% block="line x0 %x0 y0 %y0 x1 %x1 y1 %y1 color %color"
    export function line(x0: number, y0: number, x1: number, y1: number, color: Color) {
        let dx = Math.abs(x1 - x0)
        let dy = -Math.abs(y1 - y0)
        let sx = x0 < x1 ? 1 : -1
        let sy = y0 < y1 ? 1 : -1
        let err = dx + dy

        while (true) {
            pixel(x0, y0, color)
            if (x0 == x1 && y0 == y1) break
            let e2 = 2 * err
            if (e2 >= dy) {
                err += dy
                x0 += sx
            }
            if (e2 <= dx) {
                err += dx
                y0 += sy
            }
        }
    }

    // fast circle (midpoint)
    //% block="circle x %x y %y r %r color %color"
    export function circle(x0: number, y0: number, r: number, color: Color) {
        let x = r
        let y = 0
        let err = 0

        while (x >= y) {
            pixel(x0 + x, y0 + y, color)
            pixel(x0 + y, y0 + x, color)
            pixel(x0 - y, y0 + x, color)
            pixel(x0 - x, y0 + y, color)
            pixel(x0 - x, y0 - y, color)
            pixel(x0 - y, y0 - x, color)
            pixel(x0 + y, y0 - x, color)
            pixel(x0 + x, y0 - y, color)

            y++
            if (err <= 0) {
                err += 2 * y + 1
            } else {
                x--
                err += 2 * (y - x) + 1
            }
        }
    }

    // ==== LOW LEVEL ====

    function clamp(v: number, min: number, max: number) {
        return Math.max(min, Math.min(max, v))
    }

    function clampWindow(x0: number, y0: number, x1: number, y1: number) {
        x0 = clamp(x0, 0, TFTWIDTH - 1)
        x1 = clamp(x1, 0, TFTWIDTH - 1)
        y0 = clamp(y0, 0, TFTHEIGHT - 1)
        y1 = clamp(y1, 0, TFTHEIGHT - 1)
    }

    function setWindow(x0: number, y0: number, x1: number, y1: number) {
        x0 += X_OFFSET
        x1 += X_OFFSET
        y0 += Y_OFFSET
        y1 += Y_OFFSET

        sendData(CMD.CASET, [0x00, x0, 0x00, x1])
        sendData(CMD.RASET, [0x00, y0, 0x00, y1])
        send(CMD.RAMWR)
    }

    function writeColor(color: number) {
        pins.digitalWritePin(DC_PIN, 1)
        pins.digitalWritePin(CS_PIN, 0)
    
        // FIX RGB565 byte order
        pins.spiWrite(color & 0xFF)
        pins.spiWrite(color >> 8)
    
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
