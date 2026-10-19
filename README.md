# 1.8-inch TFT for micro:bit and Wukong

A Microsoft MakeCode extension for the **Lonely Binary TK89** display
(ST7735S, 160 x 128 pixels in landscape orientation, RGB565 colors).
Tested with micro:bit V2 and the ELECFREAKS Wukong expansion board.

Draw pixels, filled rectangles, lines and circle outlines using Blocks or
JavaScript. No separate Wukong extension is required.

## Wiring

Turn off power before connecting wires. The labels below match the TK89 board.
Use **P2 for CS** to avoid the Wukong buzzer connected to P0.

| TK89 label | Wukong connection | Purpose |
| --- | --- | --- |
| **GND** | **G / GND** | Ground |
| **3V3** | **3V / 3.3V** supply | Display power |
| **CS** | **S** on **P2** | Chip select |
| **MO** / **MOSI** | **S** on **P15** | SPI data |
| **SCL** | **S** on **P13** | SPI clock |
| **DC** | **S** on **P1** | Data / command |
| **RST** | **S** on **P8** | Reset |
| **BL** / **BACKLIGHT** | **3V / 3.3V** supply | Backlight enabled |

**Connect both 3V3 and BL to 3.3V, never 5V.** The TK89 has no voltage regulator
or level shifters. If your expansion board does not clearly identify a 3.3V
supply, use the micro:bit **3V** contact. Do not use the servo power rail.

On a Wukong **G-V-S** connector, use **S** for signals and **G** for ground.
P2 is the micro:bit GPIO port, not the servo connector S2. Keep P2 free of
other devices. The display's **SCL is SPI clock**, not I2C SCL. MISO is unused;
leave P14 unconnected.

The library keeps **P0 as the default CS** for existing projects. With the P2
wiring above, explicitly choose **CS P2** in the init block or pass
`DigitalPin.P2` to `TFT.init`. Wukong V2.0 has a buzzer on P0 without a mute
switch; using P0 for CS can produce clicks during drawing.

Manufacturer references:
[TK89 pinout](https://learn.lonelybinary.com/tinkerblock/blocks/tft-1-8-inch/the-eight-pins)
and [Wukong revisions and pinout](https://wiki.elecfreaks.com/en/microbit/octopus-series/expansion-board/wukong/).

## Add the extension

1. Create a project at [makecode.microbit.org](https://makecode.microbit.org/).
2. Open **Extensions** and search for:
   `https://github.com/akoprogtry/pxt-18-tft`.
3. Add the extension. A **TFT** category appears in the toolbox.

If you previously added the Jeff-Squared extension, replace it with this fork.
For updates, use the extension update control, or remove and add the extension
again. Then download the updated program to your micro:bit.

## First screen in Blocks

Place these blocks inside **on start**, in this order:

```text
on start
    init TFT inverted [true] BGR [false] CS [P2]
    clear [Red]
```

Download the program and power on Wukong. The display should turn red.
The external display is not shown in the MakeCode simulator.

Call `init TFT` once at startup. It resets the controller and waits for it to
wake up; calling it before every drawing operation will slow your program.

## JavaScript example

```typescript
TFT.init(true, false, DigitalPin.P2)
TFT.clear(TFT.Color.Black)
TFT.fillRect(20, 20, 40, 30, TFT.Color.Red)
TFT.line(0, 0, 159, 127, TFT.Color.Green)
TFT.circle(80, 64, 20, TFT.Color.Blue)
TFT.pixel(10, 10, TFT.Color.White)
```

## API

| Function | Description |
| --- | --- |
| `TFT.init(inverted = true, bgr = false, cs = DigitalPin.P0)` | Initialize the display and choose its color settings and CS pin. |
| `TFT.clear(color)` | Fill the entire screen. |
| `TFT.pixel(x, y, color)` | Draw one pixel. |
| `TFT.fillRect(x, y, w, h, color)` | Draw a filled rectangle. |
| `TFT.line(x0, y0, x1, y1, color)` | Draw a line including both endpoints. |
| `TFT.circle(x, y, radius, color)` | Draw a circle outline. |

Coordinates are integer pixels: **x = 0..159**, **y = 0..127**, starting at the
top-left corner. Rectangles are clipped to the screen; pixels outside it are
ignored. Width, height and radius are measured in pixels.

Colors are available as `TFT.Color.Black`, `White`, `Red`, `Green`, `Blue`,
`Yellow`, `Cyan` and `Magenta`. Text rendering and scrolling are not included.
The original extension's `drawPixel`, `drawRectangle`, `clearScreen` and global
`Color` names are replaced by the API above.

## Check colors and wiring

Copy [test.ts](test.ts) into the JavaScript editor of a project that has this
extension installed. The example uses **CS P2**.

The upper bands, left to right, should be **black, white, red, green, blue,
cyan, magenta and yellow**. Lower outlines should match the band above them;
the first black outline blends into the black background. A white border
should be visible along all four edges.

- **Button A** toggles inversion. Use it when black and white are reversed.
- **Button B** toggles RGB/BGR order. Use it when red and blue are swapped.
- USB serial output reports `inverted` and `bgr` as 0 or 1. Copy the working
  settings into your project's init block; button changes reset on restart.

The example reinitializes the display when either setting changes. Normal
animation should initialize only once.

If the screen remains white, check that initialization runs and verify CS,
RST, DC, SCL and MOSI against the wiring table. A lit backlight alone does
not confirm communication with the controller.

Other ST7735 panels may require different inversion, color order, initialization
or memory offsets. The internal `X_OFFSET` and `Y_OFFSET` are zero for TK89.

## Drawing speed

Pixel data is sent in reusable chunks of up to 4096 bytes. Horizontal and
vertical lines use the same buffered drawing path. The default SPI clock is
**4 MHz**; speed depends on the board and the drawing operation.

For animation, update only the area that changes. On a solid background,
erase the old shape with the background color before drawing its new position.
Avoid clearing the entire screen on every frame.

## Development

With Node.js and TypeScript installed locally, run:

```sh
node tests/driver.test.js
```

You can also pass the path to an existing TypeScript compiler:

```sh
node tests/driver.test.js /path/to/typescript/lib/typescript.js
```

The tests type-check the library and example, execute the driver with mocked
hardware, and verify RGB565 byte order, clipping, buffered transfers, CS selection
and example controls. They do not replace a MakeCode firmware build or testing
on a physical display. Import this repository into MakeCode to compile and run
the hardware example.

The package is prepared as **1.0.0**. To publish that version, create and push
the matching **v1.0.0** tag or use MakeCode's release workflow. Inclusion in the
extension search gallery requires separate
[approval](https://makecode.microbit.org/extensions/approval).

## License and credits

[MIT](LICENCE). Based on
[Jeff-Squared/pxt-18-tft](https://github.com/Jeff-Squared/pxt-18-tft).
The upstream project also credits
[joy-it/pxt-RB-TFT1.8](https://github.com/joy-it/pxt-RB-TFT1.8) and
[Simple Circuit's ST7735 example](https://simple-circuit.com/st7735-tft-vertical-scrolling-ccs-c/).

* for PXT/microbit
