let inverted = true
let bgr = false
let redraw = true

function drawTest(invertColors: boolean, useBgr: boolean) {
    TFT.init(invertColors, useBgr)
    TFT.clear(TFT.Color.Black)
    let colors = [TFT.Color.Black, TFT.Color.White, TFT.Color.Red, TFT.Color.Green,
        TFT.Color.Blue, TFT.Color.Cyan, TFT.Color.Magenta, TFT.Color.Yellow]

    for (let i = 0; i < colors.length; i++) {
        let x = i * 20
        TFT.fillRect(x, 0, 20, 56, colors[i])
        TFT.line(x + 2, 68, x + 17, 68, colors[i])
        TFT.line(x + 2, 68, x + 2, 110, colors[i])
        TFT.line(x + 17, 68, x + 17, 110, colors[i])
        TFT.line(x + 2, 110, x + 17, 110, colors[i])
        TFT.circle(x + 10, 89, 6, colors[i])
    }

    // One-pixel border checks the orientation, offsets and all four screen edges.
    TFT.line(0, 0, 159, 0, TFT.Color.White)
    TFT.line(0, 127, 159, 127, TFT.Color.White)
    TFT.line(0, 0, 0, 127, TFT.Color.White)
    TFT.line(159, 0, 159, 127, TFT.Color.White)
    serial.writeValue("inverted", invertColors ? 1 : 0)
    serial.writeValue("bgr", useBgr ? 1 : 0)
}

input.onButtonPressed(Button.A, function () {
    inverted = !inverted
    redraw = true
})

input.onButtonPressed(Button.B, function () {
    bgr = !bgr
    redraw = true
})

basic.forever(function () {
    if (redraw) {
        redraw = false
        drawTest(inverted, bgr)
    }
    basic.pause(100)
})
