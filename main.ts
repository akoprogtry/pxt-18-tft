// TFT driver for micro:bit + Wukong + Lonely Binary TK89 (ST7735S).

//% weight=100 color="#0fbc11" icon="\uf26c"
namespace TFT {
    const TFTWIDTH = 160
    const TFTHEIGHT = 128

    let CS_PIN = DigitalPin.P0
    const DC_PIN = DigitalPin.P1
    const RST_PIN = DigitalPin.P8

    // Panel offsets; TK89 uses the full window from (0, 0).
    const X_OFFSET = 0
    const Y_OFFSET = 0

    enum CMD {
        SWRESET = 0x01,
        SLPOUT = 0x11,
        NORON = 0x13,
        INVOFF = 0x20,
        INVON = 0x21,
        DISPON = 0x29,
        CASET = 0x2A,
        RASET = 0x2B,
        RAMWR = 0x2C,
        MADCTL = 0x36,
        COLMOD = 0x3A,
        FRMCTR1 = 0xB1,
        FRMCTR2 = 0xB2,
        FRMCTR3 = 0xB3,
        INVCTR = 0xB4,
        PWCTR1 = 0xC0,
        PWCTR2 = 0xC1,
        PWCTR3 = 0xC2,
        PWCTR4 = 0xC3,
        PWCTR5 = 0xC4,
        VMCTR1 = 0xC5,
        GMCTRP1 = 0xE0,
        GMCTRN1 = 0xE1
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

    //% block="init TFT inverted %inverted BGR %bgr CS %cs"
    //% inverted.defl=true bgr.defl=false
    //% cs.defl=DigitalPin.P0
    export function init(inverted: boolean = true, bgr: boolean = false, cs: DigitalPin = DigitalPin.P0): void {
        CS_PIN = cs
        pins.digitalWritePin(CS_PIN, 1)
        pins.digitalWritePin(DC_PIN, 1)
        pins.spiPins(DigitalPin.P15, DigitalPin.P14, DigitalPin.P13)
        pins.spiFrequency(4000000)
        pins.spiFormat(8, 0)

        // reset
        pins.digitalWritePin(RST_PIN, 1)
        basic.pause(20)
        pins.digitalWritePin(RST_PIN, 0)
        basic.pause(20)
        pins.digitalWritePin(RST_PIN, 1)
        basic.pause(120)

        send(CMD.SWRESET)
        basic.pause(150)
        send(CMD.SLPOUT)
        basic.pause(500)

        // Restore the frame, power and gamma setup used by the original driver.
        sendData(CMD.FRMCTR1, [0x01, 0x2C, 0x2D])
        sendData(CMD.FRMCTR2, [0x01, 0x2C, 0x2D])
        sendData(CMD.FRMCTR3, [0x01, 0x2C, 0x2D, 0x01, 0x2C, 0x2D])
        sendData(CMD.INVCTR, [0x07])
        sendData(CMD.PWCTR1, [0xA2, 0x02, 0x84])
        sendData(CMD.PWCTR2, [0xC5])
        sendData(CMD.PWCTR3, [0x0A, 0x00])
        sendData(CMD.PWCTR4, [0x8A, 0x2A])
        sendData(CMD.PWCTR5, [0x8A, 0xEE])
        sendData(CMD.VMCTR1, [0x0E])
        sendData(CMD.GMCTRP1, [0x0F, 0x1A, 0x0F, 0x18, 0x2F, 0x28, 0x20, 0x22, 0x1F, 0x1B, 0x23, 0x37, 0x00, 0x07, 0x02, 0x10])
        sendData(CMD.GMCTRN1, [0x0F, 0x1B, 0x0F, 0x17, 0x33, 0x2C, 0x29, 0x2E, 0x30, 0x30, 0x39, 0x3F, 0x00, 0x07, 0x03, 0x10])

        sendData(CMD.COLMOD, [0x05]) // RGB565
        sendData(CMD.MADCTL, [0xA0 | (bgr ? 0x08 : 0x00)])
        // TK89 panels may need INVON for black and white to display correctly.
        send(inverted ? CMD.INVON : CMD.INVOFF)
        send(CMD.NORON)
        basic.pause(10)

        send(CMD.DISPON)
        basic.pause(100)
    }

    //% block="clear %color"
    export function clear(color: Color): void {
        fillRect(0, 0, TFTWIDTH, TFTHEIGHT, color)
    }

    //% block="pixel x %x y %y color %color"
    export function pixel(x: number, y: number, color: Color): void {
        if (x < 0 || y < 0 || x >= TFTWIDTH || y >= TFTHEIGHT) return

        setWindow(x, y, x, y)
        writeColor(color)
    }

    //% block="rect x %x y %y w %w h %h color %color"
    export function fillRect(x: number, y: number, w: number, h: number, color: Color): void {
        if (w <= 0 || h <= 0) return

        let x1 = Math.min(TFTWIDTH - 1, x + w - 1)
        let y1 = Math.min(TFTHEIGHT - 1, y + h - 1)
        x = Math.max(0, x)
        y = Math.max(0, y)
        if (x > x1 || y > y1) return

        setWindow(x, y, x1, y1)
        let count = (x1 - x + 1) * (y1 - y + 1)

        // V2 yields on each SPI transfer; larger chunks reduce scheduler overhead.
        let chunkPixels = Math.min(count, 2048)
        let data = pins.createBuffer(chunkPixels * 2)
        for (let i = 0; i < data.length; i += 2) {
            data[i] = color >> 8
            data[i + 1] = color & 0xFF
        }

        pins.digitalWritePin(DC_PIN, 1)
        pins.digitalWritePin(CS_PIN, 0)

        while (count >= chunkPixels) {
            pins.spiTransfer(data, null)
            count -= chunkPixels
        }
        if (count > 0) {
            pins.spiTransfer(data.slice(0, count * 2), null)
        }

        pins.digitalWritePin(CS_PIN, 1)
    }

    //% block="line x0 %x0 y0 %y0 x1 %x1 y1 %y1 color %color"
    export function line(x0: number, y0: number, x1: number, y1: number, color: Color): void {
        if (y0 == y1) {
            fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0) + 1, 1, color)
            return
        }
        if (x0 == x1) {
            fillRect(x0, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, color)
            return
        }
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

    //% block="circle x %x y %y r %r color %color"
    export function circle(x0: number, y0: number, r: number, color: Color): void {
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

    function setWindow(x0: number, y0: number, x1: number, y1: number): void {
        x0 += X_OFFSET
        x1 += X_OFFSET
        y0 += Y_OFFSET
        y1 += Y_OFFSET

        sendData(CMD.CASET, [0x00, x0, 0x00, x1])
        sendData(CMD.RASET, [0x00, y0, 0x00, y1])
        send(CMD.RAMWR)
    }

    function writeColor(color: number): void {
        let data = pins.createBuffer(2)
        data[0] = color >> 8
        data[1] = color & 0xFF
        pins.digitalWritePin(DC_PIN, 1)
        pins.digitalWritePin(CS_PIN, 0)

        pins.spiTransfer(data, null)

        pins.digitalWritePin(CS_PIN, 1)
    }

    function send(cmd: number): void {
        pins.digitalWritePin(DC_PIN, 0)
        pins.digitalWritePin(CS_PIN, 0)
        pins.spiWrite(cmd)
        pins.digitalWritePin(CS_PIN, 1)
    }

    function sendData(cmd: number, data: number[]): void {
        let buffer = pins.createBuffer(data.length)
        for (let i = 0; i < data.length; i++) {
            buffer[i] = data[i]
        }
        send(cmd)
        pins.digitalWritePin(DC_PIN, 1)
        pins.digitalWritePin(CS_PIN, 0)

        pins.spiTransfer(buffer, null)

        pins.digitalWritePin(CS_PIN, 1)
    }
}
