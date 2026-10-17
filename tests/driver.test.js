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
declare enum DigitalPin { P0, P1, P2, P8, P13, P14, P15 }
declare enum Button { A, B }
interface Buffer {
    [index: number]: number;
    length: number;
    slice(start: number, end?: number): Buffer;
}
declare namespace pins {
    function spiPins(mosi: DigitalPin, miso: DigitalPin, sck: DigitalPin): void;
    function spiFrequency(hz: number): void;
    function spiFormat(bits: number, mode: number): void;
    function digitalWritePin(pin: DigitalPin, value: number): void;
    function spiWrite(value: number): number;
    function createBuffer(size: number): Buffer;
    function spiTransfer(command: Buffer, response: Buffer | null): void;
}
declare namespace basic {
    function pause(ms: number): void;
    function forever(callback: () => void): void;
}
declare namespace input {
    function onButtonPressed(button: Button, callback: () => void): void;
    function runningTime(): number;
}
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
const pinWrites = [];
let displayCs = 0;
const spiSetup = {};
const buttons = new Map();
const values = {};
const calls = { single: 0, bulk: 0 };
let tick;
const context = vm.createContext({
    DigitalPin: { P0: 0, P1: 1, P2: 2, P8: 8, P13: 13, P14: 14, P15: 15 },
    Button: { A: 0, B: 1 },
    pins: {
        spiPins: (...args) => { spiSetup.pins = args; },
        spiFrequency: hz => { spiSetup.hz = hz; },
        spiFormat: (...args) => { spiSetup.format = args; },
        digitalWritePin: (pin, value) => {
            pinWrites.push([pin, value]);
            pinLevels.set(pin, value);
        },
        createBuffer: size => Buffer.alloc(size),
        spiTransfer: (command, response) => {
            calls.bulk++;
            assert.equal(response, null);
            assert.equal(pinLevels.get(displayCs), 0);
            assert.equal(pinLevels.get(1), 1);
            assert(command.length <= 4096, 'transfers do not allocate a full-screen buffer');
            packets[packets.length - 1].data.push(...command);
        },
        spiWrite: value => {
            calls.single++;
            assert.equal(pinLevels.get(displayCs), 0, 'SPI writes must select the display');
            assert(value >= 0 && value <= 255 && Number.isInteger(value), 'SPI accepts bytes');
            if (pinLevels.get(1) === 0) packets.push({ command: value, data: [] });
            else packets[packets.length - 1].data.push(value);
            return 0;
        }
    },
    basic: { pause() {}, forever(callback) { tick = callback; } },
    input: {
        onButtonPressed: (button, callback) => buttons.set(button, callback),
        runningTime: () => calls.single + calls.bulk
    },
    serial: { writeValue: (name, value) => { values[name] = value; } }
});
function run(text) {
    vm.runInContext(ts.transpile(text, { target: ts.ScriptTarget.ES5 }), context);
}
function capture(text) {
    packets.length = 0;
    pinWrites.length = 0;
    calls.single = 0;
    calls.bulk = 0;
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
console.log(`Full clear: ${calls.single} single-byte calls, ${calls.bulk} buffer transfers`);
assert(calls.single <= 3 && calls.bulk <= 12, 'batch address data as well as larger pixel chunks');
capture('TFT.fillRect(0, 0, 129, 17, TFT.Color.Red)');
assert.deepEqual(lastData(0x2c), Array(129 * 17).fill([0xf8, 0]).flat(), 'partial final chunk has exactly the remaining pixels');
assert.equal(calls.bulk, 4);
capture('TFT.pixel(0, 0, TFT.Color.Red)');
assert.deepEqual(lastData(0x2c), [0xf8, 0]);
assert.equal(calls.single, 3, 'pixel commands use three single-byte calls');
assert.equal(calls.bulk, 3, 'coordinates and pixel color use buffer transfers');
capture('var measuredClear = TFT.measureClear(TFT.Color.Blue)');
assert.equal(context.measuredClear, calls.single + calls.bulk, 'measure only the time spent in clear');
assert.deepEqual(lastData(0x2c), Array(160 * 128).fill([0, 0x1f]).flat());
capture('TFT.line(10, 5, -3, 5, TFT.Color.Green)');
assert.deepEqual(lastData(0x2a), [0, 0, 0, 10]);
assert.deepEqual(lastData(0x2b), [0, 5, 0, 5]);
assert.deepEqual(lastData(0x2c), Array(11).fill([0x07, 0xe0]).flat());
assert.equal(packets.filter(p => p.command === 0x2c).length, 1);
capture('TFT.line(5, 140, 5, 120, TFT.Color.Blue)');
assert.deepEqual(lastData(0x2a), [0, 5, 0, 5]);
assert.deepEqual(lastData(0x2b), [0, 120, 0, 127]);
assert.deepEqual(lastData(0x2c), Array(8).fill([0, 0x1f]).flat());
capture('TFT.line(3, 4, 3, 4, TFT.Color.Red)');
assert.deepEqual(lastData(0x2c), [0xf8, 0]);
capture('TFT.line(0, 0, 2, 2, TFT.Color.Red)');
assert.equal(packets.filter(p => p.command === 0x2c).length, 3, 'diagonal lines still draw each pixel');
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
displayCs = 2;
capture('TFT.init(true, false, DigitalPin.P2); TFT.clear(TFT.Color.Red); TFT.pixel(0, 0, TFT.Color.Blue)');
assert(pinWrites.some(([pin]) => pin === 2), 'custom CS uses P2');
assert(pinWrites.every(([pin]) => pin !== 0), 'drawing on P2 never drives the P0 buzzer');
assert.equal(pinLevels.get(2), 1, 'custom CS is deselected after drawing');
assert.deepEqual(lastData(0x2c), [0, 0x1f]);
displayCs = 0;

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
console.log('PASS: TypeScript, RGB565, clipping, batching, lines, initialization and hardware demo buttons');
