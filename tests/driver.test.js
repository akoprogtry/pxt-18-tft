// Run with Node.js and TypeScript: node tests/driver.test.js [path/to/typescript.js]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.argv[2] || 'typescript');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'main.ts'), 'utf8');
const demo = fs.readFileSync(path.join(root, 'test.ts'), 'utf8');
const declarations = `
declare enum DigitalPin { P0, P1, P8, P13, P14, P15 }
declare enum Button { A, B }
declare namespace pins {
    function spiPins(mosi: DigitalPin, miso: DigitalPin, sck: DigitalPin): void;
    function spiFrequency(hz: number): void;
    function spiFormat(bits: number, mode: number): void;
    function digitalWritePin(pin: DigitalPin, value: number): void;
    function spiWrite(value: number): number;
}
declare namespace basic {
    function pause(ms: number): void;
    function forever(callback: () => void): void;
}
declare namespace input { function onButtonPressed(button: Button, callback: () => void): void; }
declare namespace serial { function writeValue(name: string, value: number): void; }
`;

// Type-check the real library and the hardware demo together, without generated files.
const filename = path.join(root, 'main.ts');
const options = { noEmit: true, strict: true, target: ts.ScriptTarget.ES5 };
if (parseInt(ts.version, 10) >= 6) options.ignoreDeprecations = '6.0';
const host = ts.createCompilerHost(options);
const originalGetSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (file, version, ...args) => path.resolve(file) === filename
    ? ts.createSourceFile(file, declarations + source + demo, version, true)
    : originalGetSourceFile(file, version, ...args);
const program = ts.createProgram([filename], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);

const packets = [];
const pinLevels = new Map();
const spiSetup = {};
const buttons = new Map();
const values = {};
let tick;
const context = vm.createContext({
    DigitalPin: { P0: 0, P1: 1, P8: 8, P13: 13, P14: 14, P15: 15 },
    Button: { A: 0, B: 1 },
    pins: {
        spiPins: (...args) => { spiSetup.pins = args; },
        spiFrequency: hz => { spiSetup.hz = hz; },
        spiFormat: (...args) => { spiSetup.format = args; },
        digitalWritePin: (pin, value) => pinLevels.set(pin, value),
        spiWrite: value => {
            assert.equal(pinLevels.get(0), 0, 'SPI writes must select the display');
            assert(value >= 0 && value <= 255 && Number.isInteger(value), 'SPI accepts bytes');
            if (pinLevels.get(1) === 0) packets.push({ command: value, data: [] });
            else packets[packets.length - 1].data.push(value);
            return 0;
        }
    },
    basic: { pause() {}, forever(callback) { tick = callback; } },
    input: { onButtonPressed: (button, callback) => buttons.set(button, callback) },
    serial: { writeValue: (name, value) => { values[name] = value; } }
});
function run(text) {
    vm.runInContext(ts.transpile(text, { target: ts.ScriptTarget.ES5 }), context);
}
function capture(text) {
    packets.length = 0;
    run(text);
    return packets;
}
function lastData(command) {
    return packets.filter(p => p.command === command).pop().data;
}
run(source);

for (const color of ['Black', 'White', 'Red', 'Green', 'Blue', 'Yellow', 'Cyan', 'Magenta']) {
    capture(`TFT.pixel(5, 6, TFT.Color.${color})`);
    const pixel = lastData(0x2c).slice();
    capture(`TFT.fillRect(5, 6, 1, 1, TFT.Color.${color})`);
    assert.deepEqual(pixel, lastData(0x2c), `${color}: pixels and fills must match`);
}
capture('TFT.pixel(0, 0, TFT.Color.Red)');
assert.deepEqual(lastData(0x2c), [0xf8, 0x00], 'RGB565 is sent high byte first');
capture('TFT.fillRect(-2, -1, 5, 3, TFT.Color.Green)');
assert.deepEqual(lastData(0x2a), [0, 0, 0, 2]);
assert.deepEqual(lastData(0x2b), [0, 0, 0, 1]);
assert.deepEqual(lastData(0x2c), Array(6).fill([0x07, 0xe0]).flat());
capture('TFT.fillRect(158, 126, 5, 5, TFT.Color.Blue)');
assert.deepEqual(lastData(0x2a), [0, 158, 0, 159]);
assert.deepEqual(lastData(0x2b), [0, 126, 0, 127]);
assert.equal(lastData(0x2c).length, 8);
assert.equal(capture('TFT.fillRect(160, 0, 2, 2, TFT.Color.Red); TFT.fillRect(-5, 0, 2, 2, TFT.Color.Red); TFT.fillRect(0, 128, 2, 2, TFT.Color.Red); TFT.fillRect(0, -5, 2, 2, TFT.Color.Red); TFT.fillRect(0, 0, 0, 2, TFT.Color.Red)').length, 0);
assert.equal(capture('TFT.pixel(-1, 0, TFT.Color.Red); TFT.pixel(160, 128, TFT.Color.Red)').length, 0);
capture('TFT.clear(TFT.Color.Black)');
assert.equal(lastData(0x2c).length, 160 * 128 * 2);
capture('TFT.init()');
assert.deepEqual(spiSetup, { pins: [15, 14, 13], hz: 4000000, format: [8, 0] });
assert(packets.some(p => p.command === 0x21), 'TK89 defaults to inversion on');
assert.deepEqual(lastData(0x36), [0xa0]);
assert.deepEqual(lastData(0x3a), [0x05]);
assert(packets.some(p => p.command === 0xe0 && p.data.length === 16), 'positive gamma is initialized');
assert(packets.some(p => p.command === 0xe1 && p.data.length === 16), 'negative gamma is initialized');
assert.equal(packets[packets.length - 1].command, 0x29);
capture('TFT.init(false, true)');
assert(packets.some(p => p.command === 0x20));
assert(!packets.some(p => p.command === 0x21));
assert.deepEqual(lastData(0x36), [0xa8]);

assert.equal(diagnostics.length, 0, diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
run(demo);
tick();
assert.equal(values.inverted, 1);
assert.equal(values.bgr, 0);
buttons.get(0)();
packets.length = 0;
tick();
assert(packets.some(p => p.command === 0x20), 'button A disables inversion');
assert.equal(values.inverted, 0);
buttons.get(1)();
tick();
assert.deepEqual(lastData(0x36), [0xa8], 'button B switches RGB to BGR');
assert.equal(values.bgr, 1);
console.log('PASS: TypeScript, RGB565, clipping, initialization and hardware demo buttons');
